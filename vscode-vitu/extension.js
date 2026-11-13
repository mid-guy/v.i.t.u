'use strict';

const vscode = require('vscode');
const {
	buildVirtual,
	srcOffsetToGen,
	genOffsetToSrc,
} = require('./lib/virtual');
const { createVituService } = require('./lib/service');
const { collectDiagnostics } = require('./lib/diagnostics');

const LANGUAGES = ['javascriptreact', 'typescriptreact', 'javascript', 'typescript'];
const SELECTOR = LANGUAGES.map((language) => ({ language, scheme: 'file' }));

let service;
let diagnostics;
const virtualCache = new Map(); // uri string -> { version, virtual }
const pendingRefresh = new Map(); // uri string -> timeout

function getVirtual(document) {
	const key = document.uri.toString();
	const cached = virtualCache.get(key);
	if (cached && cached.version === document.version) return cached.virtual;

	const virtual = buildVirtual(document.getText());
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

const SEVERITY = {
	error: vscode.DiagnosticSeverity.Error,
	warning: vscode.DiagnosticSeverity.Warning,
	suggestion: vscode.DiagnosticSeverity.Hint,
};

function refreshDiagnostics(document) {
	if (!LANGUAGES.includes(document.languageId)) return;
	const v = getVirtual(document);
	const fileName = document.uri.fsPath;
	const range = (start, end) =>
		new vscode.Range(document.positionAt(start), document.positionAt(end));
	const result = [];
	for (const d of collectDiagnostics(service, fileName, v)) {
		const diag = new vscode.Diagnostic(range(d.start, d.end), d.message, SEVERITY[d.category]);
		diag.source = d.source;
		if (d.code !== undefined) diag.code = d.code;
		const tags = [];
		if (d.unnecessary) tags.push(vscode.DiagnosticTag.Unnecessary);
		if (d.deprecated) tags.push(vscode.DiagnosticTag.Deprecated);
		if (tags.length) diag.tags = tags;
		result.push(diag);
	}
	diagnostics.set(document.uri, result);
}

function scheduleRefresh(document) {
	const key = document.uri.toString();
	clearTimeout(pendingRefresh.get(key));
	pendingRefresh.set(
		key,
		setTimeout(() => refreshDiagnostics(document), 400)
	);
}

// Maps the cursor into the virtual document; null means "not inside a
// directive or an element it rewrites", in which case we stay silent and the built-in
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
					// The __vitu* helpers of the virtual document are not user code.
					const entries = info.entries.filter((e) => !e.name.startsWith('__vitu'));
					return entries.map((e) => {
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
		vscode.workspace.onDidCloseTextDocument((document) => {
			virtualCache.delete(document.uri.toString());
			service.remove(document.uri.fsPath);
			diagnostics.delete(document.uri);
		})
	);

	for (const document of vscode.workspace.textDocuments) {
		scheduleRefresh(document);
	}
}

function deactivate() {
	for (const t of pendingRefresh.values()) clearTimeout(t);
}

module.exports = { activate, deactivate };
