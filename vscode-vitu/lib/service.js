'use strict';

const path = require('path');
const ts = require('typescript');

// Helpers the virtual documents call (see lib/virtual.js). They only exist
// for the type checker. A rejected r-for source falls back to the
// constraint, `any[]`, so the element body is not buried in follow-up errors.
const AMBIENT_TEXT = `
declare function __vituFor<S extends readonly any[]>(source: S): S[number][];
declare function __vituBool(value: boolean | undefined): {};
`;
const AMBIENT_NAME = '__vitu-ambient.d.ts';

const DEFAULT_OPTIONS = {
	jsx: ts.JsxEmit.ReactJSX,
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	esModuleInterop: true,
	skipLibCheck: true,
};

// The project's own compiler options (strict, paths, jsx, ...), so a
// directive is checked by the same rules as the code around it. JS files are
// always checked inside directives unless the config says `checkJs: false`.
function loadCompilerOptions(rootDir) {
	const configPath =
		ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json') ||
		ts.findConfigFile(rootDir, ts.sys.fileExists, 'jsconfig.json');
	let options = DEFAULT_OPTIONS;
	if (configPath) {
		const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
		// Only the options are needed: skip scanning the project's files.
		const host = { ...ts.sys, readDirectory: () => [] };
		const parsed = ts.parseJsonConfigFileContent(
			config || {},
			host,
			path.dirname(configPath)
		);
		options = { jsx: ts.JsxEmit.ReactJSX, ...parsed.options };
	}
	return { checkJs: true, ...options, allowJs: true, noEmit: true };
}

// A TypeScript LanguageService whose view of the world is the real filesystem,
// except that the open documents are overridden with their virtual content.
function createVituService(rootDir) {
	const docs = new Map(); // fileName -> { text, version }
	const ambientPath = path.join(rootDir, AMBIENT_NAME);
	const options = loadCompilerOptions(rootDir);

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
			const content = ts.sys.readFile(fn);
			return content === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(content);
		},
		getCompilationSettings: () => options,
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
	};
}

module.exports = { createVituService };
