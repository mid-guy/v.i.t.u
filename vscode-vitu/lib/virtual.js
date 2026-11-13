'use strict';

const ts = require('typescript');
const { collectDirectives } = require('../typescript-vitu-plugin/collect');

// Builds the virtual document: the file as the Babel plugin will compile it,
// so the TypeScript language service checks what actually runs.
//
//   <li r-for="(item, index) in items">{item.x}</li>
//   -> {__vituFor(items).map((item, index) => <li >{item.x}</li>)}
//
// `item`/`index` are real bindings, in the directive string and in the element
// body. `__vituFor` only accepts arrays, which is what `.map` needs at runtime
// (the `__vitu*` helpers are declared in lib/service.js).
//
//   <p r-if={user.active}>{user.name}</p>
//   <p r-else>nobody</p>
//   -> {(__vituBool((user.active)), (user.active)) ? <p >{user.name}</p>
//      : <p >nobody</p>}
//
// The real conditional gives the body the same narrowing it has at runtime.
// The condition is emitted twice: once as the test, once as the argument of
// `__vituBool`, which requires a boolean like the `r-if?: boolean` attribute
// type does. r-show gets the same check through a no-op spread:
//
//   <p r-show={open}>...</p>
//   -> <p {...__vituBool((open))}>...</p>
//
// The result maps back to the source through
//   segments     directive expressions that were moved: { src, gen, len }
//                  own    the built-in TS server cannot answer here (the
//                         inside of an r-for string), so we always do
//                  check  the boolean-check copy, used for diagnostics only
//                  role   the directive whose type the helper checks here
//                         (r-for source, r-if / r-show condition)
//   identChunks  everything copied verbatim
//   glue         generated code with no source of its own; a diagnostic
//                there is reported on the directive that produced it
//   scopes       elements whose content is answered by us instead of the
//                built-in TS server
function buildVirtual(text) {
	const sf = ts.createSourceFile(
		'virtual.tsx',
		text,
		ts.ScriptTarget.ESNext,
		true,
		ts.ScriptKind.TSX
	);
	const { elements, shows, attrs, problems } = collectDirectives(ts, sf);

	const events = [];
	for (const el of elements) {
		events.push({ pos: el.start, order: 1, type: 'open', el });
		events.push({ pos: el.end, order: 0, type: 'close', el });
	}
	// Every directive attribute is dropped; the valid ones come back as code.
	for (const a of attrs) {
		events.push({ pos: a.start, order: 1, type: 'skip', end: a.end });
	}
	for (const show of shows) {
		events.push({ pos: show.attrStart, order: 0, type: 'show', show });
	}
	events.sort((a, b) => a.pos - b.pos || a.order - b.order);

	let gen = '';
	let last = 0;
	const identChunks = [];
	const segments = [];
	const glue = [];
	const scopes = [];

	const copyTo = (pos) => {
		if (pos > last) {
			identChunks.push({ src: last, gen: gen.length, len: pos - last });
			gen += text.slice(last, pos);
		}
		last = Math.max(last, pos);
	};

	const seg = (span, flags) => {
		const len = span.end - span.start;
		segments.push({ src: span.start, gen: gen.length, len, ...flags });
		gen += text.slice(span.start, span.end);
	};

	// Generated code around segments; `emit` appends and returns nothing, the
	// glue entry spans from `genStart` to wherever `gen` ends up.
	const glued = (srcStart, srcEnd, emit) => {
		const genStart = gen.length;
		emit();
		glue.push({ genStart, genEnd: gen.length, srcStart, srcEnd });
	};

	const openElement = (el) => {
		// Outside JSX children the expression is parenthesized so it keeps its
		// meaning next to operators: `ok && <p r-if={x} />`.
		if (el.braces) gen += '{';
		else if (!el.elseOf) gen += '(';

		if (el.for) {
			const f = el.for;
			glued(f.valueStart, f.valueEnd, () => {
				gen += '__vituFor(';
				seg(f.expr, { own: true, role: 'r-for' });
				gen += ').map((';
				seg(f.item, { own: true });
				gen += ', ';
				seg(f.index, { own: true });
				gen += ') => ';
			});
		}
		if (el.if) {
			glued(el.if.start, el.if.end, () => {
				gen += '(__vituBool((';
				seg(el.if, { check: true, role: 'r-if' });
				gen += ')), (';
				seg(el.if, {});
				gen += ')) ? ';
			});
		}
		scopes.push({ srcStart: el.start, srcEnd: el.end });
	};

	// Closes what openElement started. An r-if with an r-else leaves its
	// expression open; the r-else element closes it.
	const finish = (el) => {
		if (el.for) gen += ')';
		if (el.elseOf) finish(el.elseOf);
		else gen += el.braces ? '}' : ')';
	};
	const closeElement = (el) => {
		if (el.if) gen += el.else ? ' : ' : ' : null';
		if (!el.else) finish(el);
	};

	for (const e of events) {
		copyTo(e.pos);
		if (e.type === 'open') {
			openElement(e.el);
		} else if (e.type === 'close') {
			closeElement(e.el);
		} else if (e.type === 'show') {
			glued(e.show.start, e.show.end, () => {
				gen += '{...__vituBool((';
				seg(e.show, { role: 'r-show' });
				gen += '))}';
			});
		} else {
			last = Math.max(last, e.end);
		}
	}
	copyTo(text.length);

	return {
		text: gen,
		segments,
		identChunks,
		glue,
		scopes,
		problems,
		hasDirectives: elements.length > 0 || shows.length > 0,
	};
}

function inScope(v, srcPos) {
	return v.scopes.some((s) => srcPos >= s.srcStart && srcPos < s.srcEnd);
}

// Source offset -> generated offset, for the positions we answer instead of
// the built-in TS server: inside an r-for string, or anywhere inside a scope.
// Null everywhere else.
function srcOffsetToGen(v, pos) {
	const scoped = inScope(v, pos);
	for (const s of v.segments) {
		if (s.check || !(s.own || scoped)) continue;
		if (pos >= s.src && pos <= s.src + s.len) return s.gen + (pos - s.src);
	}
	if (!scoped) return null;
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

// Generated range -> source range, for diagnostics. A range is ours when it
// starts in a directive expression, inside a scope, or in generated glue;
// everything else returns null and is left to the built-in TS server.
// `directiveOnly` keeps just the first kind (used for syntax errors, which
// the built-in server already reports for the rest of the file).
function genRangeToSrc(v, start, end, directiveOnly) {
	for (const s of v.segments) {
		const gs = s.gen;
		const ge = s.gen + s.len;
		if (start >= gs && start <= ge) {
			const ie = Math.min(Math.max(end, start), ge);
			// `role` only when the range is the whole expression: that is
			// the helper rejecting it, not an error somewhere inside.
			const whole = start === gs && ie === ge;
			return {
				start: s.src + (start - gs),
				end: s.src + (ie - gs),
				role: whole ? s.role : undefined,
			};
		}
	}
	if (directiveOnly) return null;
	for (const c of v.identChunks) {
		if (start >= c.gen && start < c.gen + c.len) {
			const srcStart = c.src + (start - c.gen);
			if (!inScope(v, srcStart)) return null;
			const ie = Math.min(Math.max(end, start), c.gen + c.len);
			return { start: srcStart, end: c.src + (ie - c.gen) };
		}
	}
	for (const g of v.glue) {
		if (start >= g.genStart && start < g.genEnd) {
			return { start: g.srcStart, end: g.srcEnd };
		}
	}
	return null;
}

module.exports = {
	buildVirtual,
	srcOffsetToGen,
	genOffsetToSrc,
	genRangeToSrc,
};
