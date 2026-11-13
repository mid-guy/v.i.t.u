'use strict';

// The directive grammar, read once here and shared by the vitu extension
// (lib/virtual.js) and the tsserver plugin (index.js). It mirrors what the
// Babel plugin accepts (scripts/index.cjs): anything Babel rejects comes back
// as a `problem`, with the same wording.
//
// `ts` is passed in because the tsserver plugin must use the TypeScript
// instance the server hands it.

// r-for="(item, index) in expr" (also the of/from keywords).
const FOR_RE =
	/^(\s*\(\s*)([A-Za-z_$][\w$]*)(\s*,\s*)([A-Za-z_$][\w$]*)(\s*\)\s+)(from|of|in)(\s+)([\s\S]+?)\s*$/;

const DIRECTIVES = new Set(['r-if', 'r-else', 'r-show', 'r-for']);

const MSG = {
	forString: 'r-for expects a string value, e.g. r-for="(item, index) in items"',
	forFormat: 'Invalid r-for expression. Expected "(item, index) in items".',
	expression: (name) => `${name} expects an expression, e.g. ${name}={condition}`,
	elseValue: 'r-else takes no value',
	elseWithIf: 'r-else and r-if cannot be used on the same element',
	elseOrphan:
		'r-else must directly follow an element with r-if (and that element cannot also carry r-for)',
};

// Returns
//   elements  elements rewritten by r-for / r-if / a paired r-else:
//             { start, end, braces, for?, if?, else?, elseOf? }
//   shows     valid r-show attributes: { attrStart, attrEnd, start, end }
//   attrs     the span of every directive attribute, valid or not
//   problems  misused directives: { start, end, message }
function collectDirectives(ts, sf) {
	const text = sf.text;
	const elements = [];
	const shows = [];
	const attrs = [];
	const problems = [];
	const byNode = new Map();

	const problem = (node, message) =>
		problems.push({ start: node.getStart(sf), end: node.end, message });

	// The span of a non-empty `{expression}` attribute value.
	const expressionOf = (attr) => {
		const init = attr.initializer;
		if (!init || !ts.isJsxExpression(init) || !init.expression) return null;
		return { start: init.expression.getStart(sf), end: init.expression.end };
	};

	const readFor = (attr) => {
		const init = attr.initializer;
		if (!init || !ts.isStringLiteral(init)) {
			problem(attr, MSG.forString);
			return null;
		}
		const valueStart = init.getStart(sf) + 1;
		const valueEnd = init.end - 1;
		const m = text.slice(valueStart, valueEnd).match(FOR_RE);
		if (!m) {
			problem(init, MSG.forFormat);
			return null;
		}
		const [, lead, item, comma, index, close, keyword, gap, expr] = m;
		const itemStart = valueStart + lead.length;
		const indexStart = itemStart + item.length + comma.length;
		const keywordStart = indexStart + index.length + close.length;
		const exprStart = keywordStart + keyword.length + gap.length;
		return {
			valueStart,
			valueEnd,
			item: { start: itemStart, end: itemStart + item.length },
			index: { start: indexStart, end: indexStart + index.length },
			keyword: { start: keywordStart, end: keywordStart + keyword.length },
			expr: { start: exprStart, end: exprStart + expr.length },
		};
	};

	const readElement = (node) => {
		const opening = ts.isJsxElement(node) ? node.openingElement : node;
		const found = {};
		for (const p of opening.attributes.properties) {
			if (!ts.isJsxAttribute(p)) continue;
			const name = p.name.getText(sf);
			if (!DIRECTIVES.has(name)) continue;
			found[name] = p;
			attrs.push({ start: p.getStart(sf), end: p.end });
		}

		const el = {
			start: node.getStart(sf),
			end: node.end,
			// As a JSX child the rewritten expression needs `{ }` around it.
			braces: ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent),
			hasFor: !!found['r-for'],
			hasIf: !!found['r-if'],
		};

		if (found['r-for']) el.for = readFor(found['r-for']);

		if (found['r-if']) {
			const cond = expressionOf(found['r-if']);
			if (cond) el.if = cond;
			else problem(found['r-if'], MSG.expression('r-if'));
		}

		if (found['r-show']) {
			const p = found['r-show'];
			const cond = expressionOf(p);
			if (cond) shows.push({ attrStart: p.getStart(sf), attrEnd: p.end, ...cond });
			else problem(p, MSG.expression('r-show'));
		}

		if (found['r-else']) {
			const p = found['r-else'];
			el.elseAttr = p;
			if (p.initializer) problem(p, MSG.elseValue);
			else if (found['r-if']) problem(p, MSG.elseWithIf);
		}

		byNode.set(node, el);
	};

	// r-else belongs to the r-if element directly before it among JSX
	// children; whitespace between the two is allowed.
	const pairElse = (children) => {
		for (let i = 0; i < children.length; i++) {
			const a = byNode.get(children[i]);
			if (!a || !a.hasIf || a.hasFor) continue;
			let j = i + 1;
			while (
				j < children.length &&
				ts.isJsxText(children[j]) &&
				text.slice(children[j].pos, children[j].end).trim() === ''
			) {
				j++;
			}
			const b = byNode.get(children[j]);
			if (!b || !b.elseAttr) continue;
			b.claimed = true;
			if (a.if) {
				a.else = b;
				b.elseOf = a;
				b.braces = false; // it sits inside the r-if's expression
			}
		}
	};

	const visit = (node) => {
		if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
			readElement(node);
		}
		ts.forEachChild(node, visit);
		if (ts.isJsxElement(node) || ts.isJsxFragment(node)) pairElse(node.children);
	};
	visit(sf);

	for (const el of byNode.values()) {
		if (el.elseAttr && !el.claimed && !el.elseAttr.initializer && !el.hasIf) {
			problem(el.elseAttr, MSG.elseOrphan);
		}
		if (el.for || el.if || el.elseOf) elements.push(el);
	}

	return { elements, shows, attrs, problems };
}

module.exports = { collectDirectives };
