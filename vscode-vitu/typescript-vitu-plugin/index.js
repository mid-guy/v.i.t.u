'use strict';

// Loaded by VSCode's built-in tsserver (contributes.typescriptServerPlugins).
// The built-in server sees the original file, where r-for="..." is a plain
// string: the loop bindings used in the element body are unresolved names to
// it, producing "any" hovers and "Cannot find name" diagnostics that duplicate
// what the vitu extension already answers from its virtual document. This
// plugin mutes exactly that noise, only inside elements carrying a directive.

const VALUE_RE =
	/^\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*\s*\)\s+(?:from|of|in)\s+\S/;
const DIRECTIVE_ATTR_RE = /^(?:r|v)-(?:if|else|show|for)$/;

function init({ typescript: ts }) {
	function create(info) {
		const ls = info.languageService;
		const proxy = Object.create(null);
		for (const k of Object.keys(ls)) {
			proxy[k] = (...args) => ls[k](...args);
		}

		// Element ranges carrying a valid r-for/v-for string directive, plus
		// the spans of every directive attribute (unknown JSX props to TS).
		const collect = (sourceFile) => {
			const scopes = [];
			const mutedAttrs = [];
			const visit = (node) => {
				if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
					const opening = ts.isJsxElement(node) ? node.openingElement : node;
					for (const p of opening.attributes.properties) {
						if (!ts.isJsxAttribute(p)) continue;
						const name = p.name.getText(sourceFile);
						if (!DIRECTIVE_ATTR_RE.test(name)) continue;
						mutedAttrs.push({ start: p.getStart(sourceFile), end: p.end });
						if (
							(name === 'r-for' || name === 'v-for') &&
							p.initializer &&
							ts.isStringLiteral(p.initializer) &&
							VALUE_RE.test(p.initializer.text)
						) {
							scopes.push({ start: node.getStart(sourceFile), end: node.end });
						}
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(sourceFile);
			return { scopes, mutedAttrs };
		};

		const getSourceFile = (fileName) => {
			const program = ls.getProgram();
			return program && program.getSourceFile(fileName);
		};

		const nodeAt = (sourceFile, pos) => {
			let found = null;
			const visit = (node) => {
				if (pos < node.getFullStart() || pos >= node.end) return;
				found = node;
				ts.forEachChild(node, visit);
			};
			visit(sourceFile);
			return found;
		};

		proxy.getQuickInfoAtPosition = (fileName, position) => {
			const quickInfo = ls.getQuickInfoAtPosition(fileName, position);
			if (!quickInfo) return quickInfo;
			const sourceFile = getSourceFile(fileName);
			if (!sourceFile) return quickInfo;
			const { scopes } = collect(sourceFile);
			if (!scopes.some((s) => position >= s.start && position < s.end)) {
				return quickInfo;
			}
			// Inside a directive element, hovers on names the built-in server
			// cannot resolve (the loop bindings and their members) are noise.
			const node = nodeAt(sourceFile, position);
			if (node && ts.isIdentifier(node)) {
				const checker = ls.getProgram().getTypeChecker();
				if (!checker.getSymbolAtLocation(node)) return undefined;
			}
			return quickInfo;
		};

		proxy.getSemanticDiagnostics = (fileName) => {
			const prior = ls.getSemanticDiagnostics(fileName);
			const sourceFile = getSourceFile(fileName);
			if (!sourceFile) return prior;
			const { scopes, mutedAttrs } = collect(sourceFile);
			if (!scopes.length && !mutedAttrs.length) return prior;
			return prior.filter((d) => {
				if (d.start == null) return true;
				// Unknown-prop errors on the directive attributes themselves.
				if (mutedAttrs.some((m) => d.start >= m.start && d.start < m.end)) {
					return false;
				}
				// "Cannot find name" (+ did-you-mean variant) on loop bindings.
				if (
					(d.code === 2304 || d.code === 2552) &&
					scopes.some((s) => d.start >= s.start && d.start < s.end)
				) {
					return false;
				}
				return true;
			});
		};

		return proxy;
	}

	return { create };
}

module.exports = init;
