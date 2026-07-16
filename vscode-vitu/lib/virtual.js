'use strict';

const ts = require('typescript');

// The single supported binding format, applied to the raw attribute value:
// "(item, index) in expr" (also v-for, and of/from keywords).
const VALUE_RE =
	/^(\s*\(\s*)([A-Za-z_$][\w$]*)(\s*,\s*)([A-Za-z_$][\w$]*)(\s*\)\s+)(from|of|in)(\s+)([\s\S]+?)\s*$/;

// Other string-era directives that may sit on elements inside an r-for scope.
// Their attribute names are unknown JSX props to TypeScript; diagnostics
// anchored on them are muted instead of surfaced.
const MUTED_ATTR_RE = /^(?:r|v)-(?:if|else|show)$/;

// Finds every JSX element carrying a valid r-for/v-for string directive using
// the TypeScript parser, so element boundaries (needed to wrap the whole
// element, children included) are exact.
function collectDirectives(text) {
	const sf = ts.createSourceFile(
		'virtual.tsx',
		text,
		ts.ScriptTarget.ESNext,
		true,
		ts.ScriptKind.TSX
	);
	const directives = [];
	const mutes = [];

	const visit = (node) => {
		if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
			const opening = ts.isJsxElement(node) ? node.openingElement : node;
			for (const p of opening.attributes.properties) {
				if (!ts.isJsxAttribute(p)) continue;
				const name = p.name.getText(sf);
				if (MUTED_ATTR_RE.test(name)) {
					mutes.push({ start: p.name.getStart(sf), end: p.name.end });
					continue;
				}
				if (name !== 'r-for' && name !== 'v-for') continue;
				if (!p.initializer || !ts.isStringLiteral(p.initializer)) continue;

				const valueSrcStart = p.initializer.getStart(sf) + 1;
				const valueSrcEnd = p.initializer.end - 1;
				const m = text.slice(valueSrcStart, valueSrcEnd).match(VALUE_RE);
				if (!m) continue;

				const [, lead, item, comma, index, close, keyword, midWs, expr] = m;
				const itemSrc = valueSrcStart + lead.length;
				const indexSrc = itemSrc + item.length + comma.length;
				const keywordSrc = indexSrc + index.length + close.length;
				const exprSrc = keywordSrc + keyword.length + midWs.length;

				directives.push({
					elStart: node.getStart(sf),
					elEnd: node.end,
					attrStart: p.getStart(sf),
					attrEnd: p.end,
					braces:
						!!node.parent &&
						(ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)),
					item,
					index,
					expr,
					itemSrc,
					indexSrc,
					exprSrc,
					keywordSrc,
					keywordLen: keyword.length,
					valueSrcStart,
					valueSrcEnd,
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return { directives, mutes };
}

// Builds the virtual document. Each element carrying a directive is wrapped
// whole — children included — in real TSX, mirroring the Babel transform:
//
//   <li r-for="(item, index) in items">{item.x}</li>
//   -> {[...(items)].map((item, index) => <li >{item.x}</li>)}
//
// so the TypeScript language service sees `item`/`index` as bindings both in
// the directive string and in the element body. `segments` map the
// item/index/expr spans; `identChunks` map everything copied verbatim;
// `scopes` are the element ranges where verbatim positions are also ours to
// answer (outside them the built-in TS server is responsible).
function buildVirtual(text) {
	const { directives, mutes } = collectDirectives(text);

	const events = [];
	for (const d of directives) {
		events.push({ pos: d.elStart, order: 1, type: 'open', d });
		events.push({ pos: d.attrStart, order: 1, type: 'skip', end: d.attrEnd });
		events.push({ pos: d.elEnd, order: 0, type: 'close', d });
	}
	events.sort((a, b) => a.pos - b.pos || a.order - b.order);

	let gen = '';
	let last = 0;
	const identChunks = [];
	const segments = [];
	const regions = [];
	const scopes = [];

	const copyTo = (pos) => {
		if (pos > last) {
			identChunks.push({ src: last, gen: gen.length, len: pos - last });
			gen += text.slice(last, pos);
		}
		last = pos;
	};

	for (const e of events) {
		copyTo(e.pos);
		if (e.type === 'open') {
			const d = e.d;
			const regionGenStart = gen.length;
			let piece = (d.braces ? '{' : '') + '[...(';
			segments.push({
				src: d.exprSrc,
				gen: regionGenStart + piece.length,
				len: d.expr.length,
			});
			piece += d.expr + ')].map((';
			segments.push({
				src: d.itemSrc,
				gen: regionGenStart + piece.length,
				len: d.item.length,
			});
			piece += d.item + ', ';
			segments.push({
				src: d.indexSrc,
				gen: regionGenStart + piece.length,
				len: d.index.length,
			});
			piece += d.index + ') => ';
			gen += piece;

			regions.push({
				keywordSrc: d.keywordSrc,
				keywordLen: d.keywordLen,
				valueSrcStart: d.valueSrcStart,
				valueSrcEnd: d.valueSrcEnd,
				genStart: regionGenStart,
				genEnd: regionGenStart + piece.length,
				// Diagnostics anchored in the generated glue (e.g. "not
				// iterable" on the spread) are reported on the whole value.
				glueGenStart: regionGenStart,
			});
			scopes.push({ srcStart: d.elStart, srcEnd: d.elEnd });
		} else if (e.type === 'skip') {
			last = e.end; // the r-for attribute itself is dropped
		} else {
			gen += e.d.braces ? ')}' : ')';
		}
	}
	copyTo(text.length);

	return {
		text: gen,
		segments,
		identChunks,
		regions,
		scopes,
		mutes,
		hasDirectives: regions.length > 0,
	};
}

function inScope(v, srcPos) {
	return v.scopes.some((s) => srcPos >= s.srcStart && srcPos < s.srcEnd);
}

// Source offset -> generated offset, for positions inside a directive's
// item/index/expr span or anywhere inside an element that carries a
// directive (its body uses the loop bindings). Elsewhere the built-in TS
// server is responsible.
function srcOffsetToGen(v, pos) {
	for (const s of v.segments) {
		if (pos >= s.src && pos <= s.src + s.len) return s.gen + (pos - s.src);
	}
	if (!inScope(v, pos)) return null;
	for (const c of v.identChunks) {
		if (pos >= c.src && pos < c.src + c.len) return c.gen + (pos - c.src);
	}
	return null;
}

// Generated offset -> source offset, across the whole file (used to map
// definition results that land in unchanged code).
function genOffsetToSrc(v, pos) {
	for (const s of v.segments) {
		if (pos >= s.gen && pos <= s.gen + s.len) return s.src + (pos - s.gen);
	}
	for (const c of v.identChunks) {
		if (pos >= c.gen && pos < c.gen + c.len) return c.src + (pos - c.gen);
	}
	const tail = v.identChunks[v.identChunks.length - 1];
	if (tail && pos === tail.gen + tail.len) return tail.src + tail.len;
	return null;
}

// Generated range -> source range, for diagnostics. Mapped when the range
// starts inside a directive span, inside a wrapped element (scope), or in
// the generated glue; everything else returns null and is dropped, so the
// built-in TS duplicates never surface twice.
function genRangeToSrc(v, start, end) {
	for (const s of v.segments) {
		const gs = s.gen;
		const ge = s.gen + s.len;
		if (start >= gs && start <= ge) {
			const ie = Math.min(Math.max(end, start), ge);
			return { start: s.src + (start - gs), end: s.src + (ie - gs) };
		}
	}
	for (const c of v.identChunks) {
		if (start >= c.gen && start < c.gen + c.len) {
			const srcStart = c.src + (start - c.gen);
			if (!inScope(v, srcStart)) return null;
			// Unknown-prop errors on sibling directives (r-if/r-show/...)
			// are expected noise, not user mistakes.
			if (v.mutes.some((m) => srcStart >= m.start && srcStart < m.end)) {
				return null;
			}
			const ie = Math.min(Math.max(end, start), c.gen + c.len);
			return { start: srcStart, end: c.src + (ie - c.gen) };
		}
	}
	for (const r of v.regions) {
		if (start >= r.glueGenStart && start < r.genEnd) {
			return { start: r.valueSrcStart, end: r.valueSrcEnd };
		}
	}
	return null;
}

module.exports = { buildVirtual, srcOffsetToGen, genOffsetToSrc, genRangeToSrc };
