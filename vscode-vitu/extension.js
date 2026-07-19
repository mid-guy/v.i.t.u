'use strict';

const vscode = require('vscode');
const { buildVirtual, srcOffsetToGen, genOffsetToSrc, genRangeToSrc } = require('./lib/virtual');
const { createVituService } = require('./lib/service');

const LANGUAGES = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'];
const SELECTOR = LANGUAGES.map((language) => ({ language, scheme: 'file' }));

let service;
let diagnostics;
const virtualCache = new Map(); // uri string -> { version, virtual }
const pendingRefresh = new Map(); // uri string -> timeout

// TypeScript's 2020 classifier token types, in encoding order.
const TS_TOKEN_TYPES = [
	'class', 'enum', 'interface', 'namespace', 'typeParameter', 'type',
	'parameter', 'variable', 'enumMember', 'property', 'function', 'member',
];

// Colors match VSCode's default Dark+/Light+ semantic colors so the directive
// content looks like surrounding code, not like a string. The base decoration
// is created first so the per-token colors created after it win on overlap.
const baseDecoration = vscode.window.createTextEditorDecorationType({
	color: new vscode.ThemeColor('editor.foreground'),
	textDecoration: 'underline',
});
const tokenDecorations = [
	{
		types: ['parameter', 'variable', 'enumMember', 'property'],
		decoration: vscode.window.createTextEditorDecorationType({
			light: { color: '#001080' },
			dark: { color: '#9CDCFE' },
		}),
	},
	{
		types: ['function', 'member'],
		decoration: vscode.window.createTextEditorDecorationType({
			light: { color: '#795E26' },
			dark: { color: '#DCDCAA' },
		}),
	},
	{
		types: ['class', 'enum', 'interface', 'namespace', 'typeParameter', 'type'],
		decoration: vscode.window.createTextEditorDecorationType({
			light: { color: '#267F99' },
			dark: { color: '#4EC9B0' },
		}),
	},
];
const keywordDecoration = vscode.window.createTextEditorDecorationType({
	light: { color: '#AF00DB' },
	dark: { color: '#C586C0' },
});

function getVirtual(document) {
	const key = document.uri.toString();
	const cached = virtualCache.get(key);
	if (cached && cached.version === document.version) return cached.virtual;

	const dialect = document.languageId.startsWith('typescript') ? 'ts' : 'js';
	const virtual = buildVirtual(document.getText(), { dialect });
	virtualCache.set(key, { version: document.version, virtual });

	const fileName = document.uri.fsPath;
	if (virtual.hasDirectives) service.upsert(fileName, virtual.text, document.version);
	else service.remove(fileName);
	return virtual;
}

function completionKind(tsKind) {
	const K = vscode.CompletionItemKind;
	switch (tsKind) {
		case 'method': case 'construct signature': return K.Method;
		case 'function': case 'local function': return K.Function;
		case 'property': case 'getter': case 'setter': return K.Property;
		case 'class': return K.Class;
		case 'interface': return K.Interface;
		case 'enum': return K.Enum;
		case 'module': return K.Module;
		case 'keyword': return K.Keyword;
		case 'parameter': return K.Variable;
		case 'const': case 'let': case 'var': case 'local var': return K.Variable;
		default: return K.Text;
	}
}

function refreshDiagnostics(document) {
	if (!LANGUAGES.includes(document.languageId)) return;
	const v = getVirtual(document);
	const fileName = document.uri.fsPath;
	if (!v.hasDirectives) {
		diagnostics.delete(document.uri);
		return;
	}

	const raw = [
		...service.ls.getSyntacticDiagnostics(fileName),
		...service.ls.getSemanticDiagnostics(fileName),
	];
	const result = [];
	const seen = new Set();
	for (const d of raw) {
		if (d.start == null) continue;
		const mapped = genRangeToSrc(v, d.start, d.start + (d.length || 1));
		if (!mapped) continue;
		// The slot-type capture replays r-for chains, so an error there can
		// also surface from the primary copy; keep one.
		const key = `${mapped.start}:${mapped.end}:${d.code}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const range = new vscode.Range(
			document.positionAt(mapped.start),
			document.positionAt(mapped.end)
		);
		const severity =
			d.category === service.ts.DiagnosticCategory.Error
				? vscode.DiagnosticSeverity.Error
				: d.category === service.ts.DiagnosticCategory.Warning
					? vscode.DiagnosticSeverity.Warning
					: vscode.DiagnosticSeverity.Information;
		const diag = new vscode.Diagnostic(
			range,
			service.ts.flattenDiagnosticMessageText(d.messageText, '\n'),
			severity
		);
		diag.source = 'vitu';
		diag.code = d.code;
		result.push(diag);
	}
	diagnostics.set(document.uri, result);
}

function updateDecorations(editor) {
	const document = editor.document;
	if (!LANGUAGES.includes(document.languageId)) return;
	const v = getVirtual(document);

	const range = (start, end) =>
		new vscode.Range(document.positionAt(start), document.positionAt(end));
	const valueRanges = [];
	const keywordRanges = [];
	const bucketRanges = tokenDecorations.map(() => []);

	if (v.hasDirectives) {
		for (const r of v.regions) {
			valueRanges.push(range(r.valueSrcStart, r.valueSrcEnd));
			keywordRanges.push(range(r.keywordSrc, r.keywordSrc + r.keywordLen));
		}
		// Semantic colors from the virtual document, applied everywhere we own:
		// the directive string and the element body, where the built-in TS
		// semantic highlighter goes blind (unresolved loop bindings).
		const fileName = document.uri.fsPath;
		let classified = null;
		try {
			classified = service.ls.getEncodedSemanticClassifications(
				fileName,
				{ start: 0, length: v.text.length },
				service.ts.SemanticClassificationFormat.TwentyTwenty
			);
		} catch {
			// stale document; decorations refresh on the next change
		}
		if (classified) {
			const spans = classified.spans;
			for (let i = 0; i < spans.length; i += 3) {
				const genStart = spans[i];
				const len = spans[i + 1];
				const src = genOffsetToSrc(v, genStart);
				if (src == null) continue;
				if (!v.scopes.some((s) => src >= s.srcStart && src < s.srcEnd)) {
					continue;
				}
				const type = TS_TOKEN_TYPES[(spans[i + 2] >> 8) - 1];
				const bucket = tokenDecorations.findIndex((b) => b.types.includes(type));
				if (bucket === -1) continue;
				bucketRanges[bucket].push(range(src, src + len));
			}
		}
	}

	editor.setDecorations(baseDecoration, valueRanges);
	editor.setDecorations(keywordDecoration, keywordRanges);
	tokenDecorations.forEach((b, i) => editor.setDecorations(b.decoration, bucketRanges[i]));
}

function refreshEditorsOf(document) {
	for (const editor of vscode.window.visibleTextEditors) {
		if (editor.document === document) updateDecorations(editor);
	}
}

function scheduleRefresh(document) {
	const key = document.uri.toString();
	clearTimeout(pendingRefresh.get(key));
	pendingRefresh.set(
		key,
		setTimeout(() => {
			refreshDiagnostics(document);
			refreshEditorsOf(document);
		}, 400)
	);
}

// Maps the cursor into the virtual document; null means "not inside a
// directive expression", in which case we stay silent and the built-in
// TypeScript server handles the position.
function toGenPosition(document, position) {
	const v = getVirtual(document);
	if (!v.hasDirectives) return null;
	const genPos = srcOffsetToGen(v, document.offsetAt(position));
	return genPos == null ? null : { v, genPos };
}

function activate(context) {
	const root =
		vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
	service = createVituService(root);
	diagnostics = vscode.languages.createDiagnosticCollection('vitu');
	context.subscriptions.push(diagnostics);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			SELECTOR,
			{
				provideCompletionItems(document, position) {
					const hit = toGenPosition(document, position);
					if (!hit) return;
					const info = service.ls.getCompletionsAtPosition(
						document.uri.fsPath,
						hit.genPos,
						{}
					);
					if (!info) return;
					return info.entries.map((e) => {
						const item = new vscode.CompletionItem(e.name, completionKind(e.kind));
						item.sortText = e.sortText;
						return item;
					});
				},
			},
			'.', '"', "'", '(', '['
		),

		vscode.languages.registerHoverProvider(SELECTOR, {
			provideHover(document, position) {
				const hit = toGenPosition(document, position);
				if (!hit) return;
				const info = service.ls.getQuickInfoAtPosition(
					document.uri.fsPath,
					hit.genPos
				);
				if (!info) return;
				const md = new vscode.MarkdownString();
				md.appendCodeblock(
					service.ts.displayPartsToString(info.displayParts),
					'typescript'
				);
				const doc = service.ts.displayPartsToString(info.documentation);
				if (doc) md.appendMarkdown('\n' + doc);
				return new vscode.Hover(md);
			},
		}),

		vscode.languages.registerDefinitionProvider(SELECTOR, {
			provideDefinition(document, position) {
				const hit = toGenPosition(document, position);
				if (!hit) return;
				const fileName = document.uri.fsPath;
				const defs = service.ls.getDefinitionAtPosition(fileName, hit.genPos);
				if (!defs) return;
				const program = service.ls.getProgram();
				const locations = [];
				for (const def of defs) {
					if (def.fileName === fileName) {
						const start = genOffsetToSrc(hit.v, def.textSpan.start);
						const end = genOffsetToSrc(hit.v, def.textSpan.start + def.textSpan.length);
						if (start == null || end == null) continue;
						locations.push(
							new vscode.Location(
								document.uri,
								new vscode.Range(document.positionAt(start), document.positionAt(end))
							)
						);
					} else {
						const sf = program && program.getSourceFile(def.fileName);
						if (!sf) continue;
						const s = sf.getLineAndCharacterOfPosition(def.textSpan.start);
						const e = sf.getLineAndCharacterOfPosition(
							def.textSpan.start + def.textSpan.length
						);
						locations.push(
							new vscode.Location(
								vscode.Uri.file(def.fileName),
								new vscode.Range(s.line, s.character, e.line, e.character)
							)
						);
					}
				}
				return locations;
			},
		}),

		vscode.workspace.onDidOpenTextDocument(scheduleRefresh),
		vscode.workspace.onDidChangeTextDocument((e) => scheduleRefresh(e.document)),
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			for (const editor of editors) updateDecorations(editor);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			virtualCache.delete(document.uri.toString());
			service.remove(document.uri.fsPath);
			diagnostics.delete(document.uri);
		})
	);

	for (const document of vscode.workspace.textDocuments) {
		scheduleRefresh(document);
	}
	for (const editor of vscode.window.visibleTextEditors) {
		updateDecorations(editor);
	}
}

function deactivate() {
	for (const t of pendingRefresh.values()) clearTimeout(t);
}

module.exports = { activate, deactivate };
