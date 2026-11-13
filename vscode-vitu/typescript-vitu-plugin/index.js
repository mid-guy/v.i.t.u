'use strict';

// Loaded by VSCode's built-in tsserver (contributes.typescriptServerPlugins).
// The built-in server sees the original file, where r-for="..." is a plain
// string and r-if is just an attribute: loop bindings are unresolved names,
// nothing is narrowed, and a variable used only inside an r-for string looks
// unused. The vitu extension answers those places from its virtual document,
// so this plugin mutes the built-in answers there and nowhere else.

const { collectDirectives } = require('./collect');

// "declared but never read/used" and its import/destructuring variants.
const UNUSED_CODES = new Set([6133, 6192, 6196, 6198]);
const IDENT_RE = /[A-Za-z_$][\w$]*/g;

function init({ typescript: ts }) {
	function create(info) {
		const ls = info.languageService;
		const proxy = Object.create(null);
		for (const k of Object.keys(ls)) {
			proxy[k] = (...args) => ls[k](...args);
		}

		// Source files are immutable: one collection per file version.
		const cache = new WeakMap();
		const collect = (fileName) => {
			const program = ls.getProgram();
			const sourceFile = program && program.getSourceFile(fileName);
			if (!sourceFile) return null;
			let found = cache.get(sourceFile);
			if (!found) {
				const { elements, attrs } = collectDirectives(ts, sourceFile);
				// Names read inside r-for strings, invisible to the server.
				const names = new Set();
				for (const el of elements) {
					if (!el.for) continue;
					const { start, end } = el.for.expr;
					for (const name of sourceFile.text.slice(start, end).match(IDENT_RE) || []) {
						names.add(name);
					}
				}
				found = { sourceFile, scopes: elements, attrs, names };
				cache.set(sourceFile, found);
			}
			return found;
		};

		const within = (ranges, pos) =>
			ranges.some((r) => pos >= r.start && pos < r.end);

		const usedInDirective = (found, d) => {
			if (!UNUSED_CODES.has(d.code) || !found.names.size) return false;
			const span = found.sourceFile.text.slice(d.start, d.start + d.length);
			return (span.match(IDENT_RE) || []).some((name) => found.names.has(name));
		};

		// Diagnostics the vitu extension reports itself: everything inside an
		// element rewritten by r-for / r-if / r-else, and on directive
		// attributes. Plus false "unused" reports for names only an r-for
		// string reads.
		const filter = (fileName, diagnostics) => {
			const found = collect(fileName);
			if (!found || (!found.scopes.length && !found.attrs.length)) {
				return diagnostics;
			}
			return diagnostics.filter((d) => {
				if (d.start == null) return true;
				if (within(found.attrs, d.start)) return false;
				if (within(found.scopes, d.start)) return false;
				return !usedInDirective(found, d);
			});
		};

		proxy.getSemanticDiagnostics = (fileName) =>
			filter(fileName, ls.getSemanticDiagnostics(fileName));

		proxy.getSuggestionDiagnostics = (fileName) =>
			filter(fileName, ls.getSuggestionDiagnostics(fileName));

		// Inside a rewritten element the extension's hover is the right one
		// (typed loop bindings, narrowed by r-if); the built-in one would sit
		// next to it in the same tooltip.
		proxy.getQuickInfoAtPosition = (fileName, position, ...rest) => {
			const found = collect(fileName);
			if (found && within(found.scopes, position)) return undefined;
			return ls.getQuickInfoAtPosition(fileName, position, ...rest);
		};

		return proxy;
	}

	return { create };
}

module.exports = init;
