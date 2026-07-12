'use strict';

// Matches r-for="item from expr" (also v-for, and of/in keywords).
const DIRECTIVE_RE =
	/(?:r|v)-for\s*=\s*"(\s*)([A-Za-z_$][\w$]*)(\s+(?:from|of|in)\s+)([^"\n]*?)(\s*)"/g;

// Builds the virtual document: each directive attribute is replaced by real
// TSX (`r-for={[...(expr)].map((item) => item)}`) so the TypeScript language
// service can check it. `segments` map the item/expr spans between source and
// generated text; `identChunks` map everything that was copied verbatim.
function buildVirtual(text) {
	let gen = '';
	let last = 0;
	const identChunks = [];
	const segments = [];
	const regions = [];

	for (const m of text.matchAll(DIRECTIVE_RE)) {
		const [full, lead, item, mid, expr] = m;
		if (!expr.trim()) continue;
		const attrSrc = m.index;

		identChunks.push({ src: last, gen: gen.length, len: attrSrc - last });
		gen += text.slice(last, attrSrc);

		const regionGenStart = gen.length;
		const attrName = full.slice(0, full.indexOf('='));
		const valueSrcStart = attrSrc + full.indexOf('"') + 1;
		const itemSrc = valueSrcStart + lead.length;
		const exprSrc = itemSrc + item.length + mid.length;

		let piece = attrName + '={[...(';
		segments.push({
			src: exprSrc,
			gen: regionGenStart + piece.length,
			len: expr.length,
		});
		piece += expr + ')].map((';
		segments.push({
			src: itemSrc,
			gen: regionGenStart + piece.length,
			len: item.length,
		});
		piece += item + ') => ' + item + ')}';
		gen += piece;

		const kw = mid.match(/\S+/);
		regions.push({
			keywordSrc: itemSrc + item.length + kw.index,
			keywordLen: kw[0].length,
			srcStart: attrSrc,
			srcEnd: attrSrc + full.length,
			valueSrcStart,
			valueSrcEnd: attrSrc + full.length - 1,
			genStart: regionGenStart,
			genEnd: regionGenStart + piece.length,
			// Generated glue starts after the attribute name; diagnostics that
			// anchor on the attribute name itself (e.g. unknown-prop errors)
			// are not ours to report.
			glueGenStart: regionGenStart + attrName.length,
		});
		last = attrSrc + full.length;
	}

	identChunks.push({ src: last, gen: gen.length, len: text.length - last });
	gen += text.slice(last);

	return { text: gen, segments, identChunks, regions, hasDirectives: regions.length > 0 };
}

// Source offset -> generated offset, only for positions inside a directive's
// item/expr span (elsewhere the built-in TS server is responsible).
function srcOffsetToGen(v, pos) {
	for (const s of v.segments) {
		if (pos >= s.src && pos <= s.src + s.len) return s.gen + (pos - s.src);
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

// Generated range -> source range, for diagnostics. Only ranges that *start*
// inside a directive are mapped; anything else returns null and is dropped.
// This drops both the built-in TS duplicates and element-level JSX errors
// whose range merely overlaps the attribute.
function genRangeToSrc(v, start, end) {
	for (const s of v.segments) {
		const gs = s.gen;
		const ge = s.gen + s.len;
		if (start >= gs && start <= ge) {
			const ie = Math.min(Math.max(end, start), ge);
			return { start: s.src + (start - gs), end: s.src + (ie - gs) };
		}
	}
	for (const r of v.regions) {
		if (start >= r.glueGenStart && start < r.genEnd) {
			return { start: r.valueSrcStart, end: r.valueSrcEnd };
		}
	}
	return null;
}

module.exports = { buildVirtual, srcOffsetToGen, genOffsetToSrc, genRangeToSrc, DIRECTIVE_RE };
