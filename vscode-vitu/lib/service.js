'use strict';

const ts = require('typescript');

// A TypeScript LanguageService whose view of the world is the real filesystem,
// except for the open documents we override with their virtual content.
function createVituService(rootDir) {
	const docs = new Map(); // fileName -> { text, version }

	const host = {
		getScriptFileNames: () => Array.from(docs.keys()),
		getScriptVersion: (fn) => {
			const d = docs.get(fn);
			return d ? String(d.version) : '0';
		},
		getScriptSnapshot: (fn) => {
			const d = docs.get(fn);
			if (d) return ts.ScriptSnapshot.fromString(d.text);
			const content = ts.sys.readFile(fn);
			return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
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
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
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
