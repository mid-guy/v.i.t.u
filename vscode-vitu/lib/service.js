'use strict';

const path = require('path');
const ts = require('typescript');
const { buildVirtual } = require('./virtual');

// Ambient declarations every virtual document can rely on. __vituCapture
// tags a component's return type with the captured slot-props type, and
// __VituSlots reads it back on the consumer side (see lib/virtual.js).
const AMBIENT_TEXT = `
declare function __vituCapture<J, S>(jsx: J, slots: S): J & { __vituSlots: S };
type __VituSlots<C> = C extends (props: any, ...rest: any[]) => infer R
	? NonNullable<R> extends { __vituSlots: infer S } ? S : any
	: any;
`;
const AMBIENT_NAME = '__vitu-ambient.d.ts';

// Files that may carry directives and are cheap to detect by content.
const SCRIPT_EXT_RE = /\.(?:jsx|tsx|js|ts|mjs|cjs)$/;
const DIRECTIVE_HINT_RE = /(?:r|v)-(?:for|show|slot)\s*=|<slot[\s/>]/;

// A TypeScript LanguageService whose view of the world is the real filesystem,
// except that (a) the open documents are overridden with their virtual
// content, and (b) any other source file containing directives is virtualized
// on read — so slot types flow across imports.
function createVituService(rootDir) {
	const docs = new Map(); // fileName -> { text, version }
	const ambientPath = path.join(rootDir, AMBIENT_NAME);

	const readSnapshot = (fn) => {
		const content = ts.sys.readFile(fn);
		if (content === undefined) return undefined;
		if (SCRIPT_EXT_RE.test(fn) && DIRECTIVE_HINT_RE.test(content)) {
			const dialect = /\.tsx?$/.test(fn) ? 'ts' : 'js';
			try {
				return ts.ScriptSnapshot.fromString(
					buildVirtual(content, { dialect }).text
				);
			} catch {
				// fall through to the raw content
			}
		}
		return ts.ScriptSnapshot.fromString(content);
	};

	const host = {
		getScriptFileNames: () => [...docs.keys(), ambientPath],
		getScriptVersion: (fn) => {
			const d = docs.get(fn);
			return d ? String(d.version) : '0';
		},
		getScriptSnapshot: (fn) => {
			if (fn === ambientPath) return ts.ScriptSnapshot.fromString(AMBIENT_TEXT);
			const d = docs.get(fn);
			if (d) return ts.ScriptSnapshot.fromString(d.text);
			return readSnapshot(fn);
		},
		getCompilationSettings: () => ({
			allowJs: true,
			checkJs: true,
			noEmit: true,
			jsx: ts.JsxEmit.ReactJSX,
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			esModuleInterop: true,
			skipLibCheck: true,
		}),
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		getCurrentDirectory: () => rootDir,
		fileExists: (fn) => fn === ambientPath || ts.sys.fileExists(fn),
		readFile: (fn) => (fn === ambientPath ? AMBIENT_TEXT : ts.sys.readFile(fn)),
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
	};

	const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

	return {
		ls,
		ts,
		upsert: (fileName, text, version) => docs.set(fileName, { text, version }),
		remove: (fileName) => docs.delete(fileName),
		has: (fileName) => docs.has(fileName),
	};
}

module.exports = { createVituService };
