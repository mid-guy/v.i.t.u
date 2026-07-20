'use strict';

const ts = require('typescript');

// The single supported binding format, applied to the raw attribute value:
// "(item, index) in expr" (also v-for, and of/from keywords).
const VALUE_RE =
	/^(\s*\(\s*)([A-Za-z_$][\w$]*)(\s*,\s*)([A-Za-z_$][\w$]*)(\s*\)\s+)(from|of|in)(\s+)([\s\S]+?)\s*$/;

// Other string-era directives that may sit on elements inside an r-for scope.
// Their attribute names are unknown JSX props to TypeScript; diagnostics
// anchored on them are muted instead of surfaced.
const MUTED_ATTR_RE = /^(?:r|v)-(?:if|else)$/;

const SHOW_ATTR_RE = /^(?:r|v)-show$/;
const RSLOT_ATTR_RE = /^(?:r|v)-slot$/;

// Component tag names usable inside `typeof <tag>` (identifier or dotted
// path starting with an uppercase identifier).
const TYPED_TAG_RE = /^[A-Z][\w$]*(?:\.[\w$]+)*$/;
const BARE_KEY_RE = /^[A-Za-z_$][\w$]*$/;

const isFnLike = (n) =>
	ts.isFunctionDeclaration(n) ||
	ts.isFunctionExpression(n) ||
	ts.isArrowFunction(n) ||
	ts.isMethodDeclaration(n);

// Finds every JSX element carrying a directive (r-for/v-for, r-show/v-show,
// r-slot/v-slot) and every `<slot>` outlet, using the TypeScript parser so
// element boundaries are exact.
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
	const rslots = [];
	const outlets = []; // raw <slot> outlets, grouped into slotFns below
	const fnOf = new Map(); // fn node -> outlet indices

	const visit = (node) => {
		if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
			const opening = ts.isJsxElement(node) ? node.openingElement : node;

			if (opening.tagName.getText(sf) === 'slot') {
				collectOutlet(node, opening);
				ts.forEachChild(node, visit);
				return;
			}

			for (const p of opening.attributes.properties) {
				if (!ts.isJsxAttribute(p)) continue;
				const name = p.name.getText(sf);
				if (RSLOT_ATTR_RE.test(name)) {
					// r-slot="{ item, index }" (a binding pattern, string form
					// only) on an element with a body: the children become a
					// scoped-slot render function.
					const init = p.initializer;
					const usable =
						ts.isJsxElement(node) &&
						init &&
						ts.isStringLiteral(init) &&
						init.text.trim();
					if (usable) {
						const valueSrcStart = init.getStart(sf) + 1;
						const valueSrcEnd = init.end - 1;
						const m = text
							.slice(valueSrcStart, valueSrcEnd)
							.match(/^(\s*)([\s\S]*?)\s*$/);
						const tagText = opening.tagName.getText(sf);
						rslots.push({
							attrStart: p.getStart(sf),
							attrEnd: p.end,
							pattern: m[2],
							patternSrc: valueSrcStart + m[1].length,
							valueSrcStart,
							valueSrcEnd,
							openEnd: opening.end,
							closeStart: node.closingElement.getStart(sf),
							tag: TYPED_TAG_RE.test(tagText) ? tagText : null,
						});
						continue;
					}
					mutes.push({ start: p.name.getStart(sf), end: p.name.end });
					continue;
				}
				if (SHOW_ATTR_RE.test(name)) {
					// r-show={expr} (JSX expression, the primary form) or the
					// string form r-show="expr"; both delimiters are one char,
					// so the inner span is computed the same way.
					const init = p.initializer;
					const usable =
						init &&
						(ts.isStringLiteral(init) ||
							(ts.isJsxExpression(init) && init.expression));
					if (usable) {
						const valueSrcStart = init.getStart(sf) + 1;
						const valueSrcEnd = init.end - 1;
						const m = text
							.slice(valueSrcStart, valueSrcEnd)
							.match(/^(\s*)([\s\S]*?)\s*$/);
						if (m[2]) {
							shows.push({
								attrStart: p.getStart(sf),
								attrEnd: p.end,
								expr: m[2],
								exprSrc: valueSrcStart + m[1].length,
								valueSrcStart,
								valueSrcEnd,
								quoted: ts.isStringLiteral(init),
							});
							continue;
						}
					}
					// No usable expression: fall back to muting the unknown prop.
					mutes.push({ start: p.name.getStart(sf), end: p.name.end });
					continue;
				}
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

	// A `<slot attr={expr}>fallback</slot>` outlet inside a component.
	const collectOutlet = (node, opening) => {
		// The enclosing component, skipping callbacks around the outlet: a
		// hand-written `.map(x => <slot .../>)` takes its children from the
		// component, not from the callback.
		let fn = node.parent;
		for (;;) {
			while (fn && !isFnLike(fn)) fn = fn.parent;
			if (!fn) return; // a bare web-component <slot>, not ours
			if (fn.parent && ts.isCallExpression(fn.parent)) {
				fn = fn.parent;
				continue;
			}
			break;
		}

		const attrs = [];
		for (const p of opening.attributes.properties) {
			if (ts.isJsxSpreadAttribute(p)) {
				attrs.push({
					spread: true,
					exprStart: p.expression.getStart(sf),
					exprEnd: p.expression.end,
				});
				continue;
			}
			const name = p.name.getText(sf);
			// `name` selects a named slot (not supported yet) and directives
			// are not slot data.
			if (name === 'name' || /^(?:r|v)-/.test(name)) continue;
			const key = BARE_KEY_RE.test(name) ? name : JSON.stringify(name);
			if (!p.initializer) {
				attrs.push({ name: key, raw: 'true' });
			} else if (ts.isStringLiteral(p.initializer)) {
				attrs.push({ name: key, raw: p.initializer.getText(sf) });
			} else if (
				ts.isJsxExpression(p.initializer) &&
				p.initializer.expression
			) {
				attrs.push({
					name: key,
					exprStart: p.initializer.expression.getStart(sf),
					exprEnd: p.initializer.expression.end,
				});
			}
		}

		const selfClosing = ts.isJsxSelfClosingElement(node);
		outlets.push({
			elStart: node.getStart(sf),
			elEnd: node.end,
			openingEnd: opening.end,
			closingStart: selfClosing ? null : node.closingElement.getStart(sf),
			selfClosing,
			attrs,
		});
		if (!fnOf.has(fn)) fnOf.set(fn, []);
		fnOf.get(fn).push(outlets.length - 1);
	};

	visit(sf);

	// Per component function carrying outlets: where to declare the slot-type
	// captures, which returns to wrap in __vituCapture, and how to reach the
	// `children` prop (injecting a binding when the author has none).
	const slotFns = [];
	for (const [fn, idxs] of fnOf) {
		if (!fn.body) continue;
		const plan = { outlets: idxs.map((i) => outlets[i]) };

		const param0 = fn.parameters[0];
		if (!param0) {
			plan.childrenExpr = 'children';
			plan.childrenInject = { pos: fn.parameters.pos, text: '{ children }' };
		} else if (ts.isIdentifier(param0.name)) {
			plan.childrenExpr = param0.name.text + '.children';
		} else if (ts.isObjectBindingPattern(param0.name)) {
			let bound = null;
			for (const el of param0.name.elements) {
				const prop = el.propertyName || el.name;
				if (
					ts.isIdentifier(prop) &&
					prop.text === 'children' &&
					ts.isIdentifier(el.name)
				) {
					bound = el.name.text;
				}
			}
			plan.childrenExpr = bound || 'children';
			if (!bound) {
				plan.childrenInject = {
					pos: param0.name.getStart(sf) + 1,
					text: 'children, ',
				};
			}
		} else {
			plan.childrenExpr = null; // array pattern etc.: no children access
		}

		if (ts.isBlock(fn.body)) {
			plan.mode = 'block';
			plan.anchorPos = fn.body.getStart(sf) + 1;
			plan.returns = [];
			const walk = (n) => {
				if (isFnLike(n)) return;
				if (ts.isReturnStatement(n) && n.expression) {
					plan.returns.push({
						exprStart: n.expression.getStart(sf),
						exprEnd: n.expression.end,
					});
				}
				ts.forEachChild(n, walk);
			};
			ts.forEachChild(fn.body, walk);
		} else {
			plan.mode = 'arrow';
			plan.bodyStart = fn.body.getStart(sf);
			plan.bodyEnd = fn.body.end;
		}
		slotFns.push(plan);
	}

	return { directives, shows, mutes, rslots, slotFns };
}

// Builds the virtual document. Each element carrying a directive is wrapped
// whole — children included — in real TSX, mirroring the Babel transform:
//
//   <li r-for="(item, index) in items">{item.x}</li>
//   -> {[...(items)].map((item, index) => <li >{item.x}</li>)}
//
// so the TypeScript language service sees `item`/`index` as bindings both in
// the directive string and in the element body. An r-show/v-show attribute
// (r-show={cond}, or the string form r-show="cond") is rewritten in place
// into a no-op JSX spread that requires the expression to be a boolean:
//
//   <p r-show={cond}>...</p>
//   -> <p {...([true].includes((cond)) ? {} : {})}>...</p>
//
// `[true]` infers boolean[], so `includes` checks `cond` against boolean —
// non-boolean expressions get a real assignability error — while the spread
// of {} stays valid on any element and adds no props.
//
// Scoped slots are typed with no annotation from the author. Inside the
// component, each `<slot a={x} b={y}>fb</slot>` outlet becomes a call of the
// children render prop, its argument type captured in a const that replays
// the enclosing r-for scope chains, and the component's returns are wrapped
// so the slot type rides out on the return type:
//
//   function List({ data }) {           // children is injected
//     return <ul><li r-for="(it, i) in data"><slot item={it}/></li></ul>;
//   }
//   ->
//   function List({children,  data }) {
//     const __vituS0 = [...(data)].map((it, i) => ({ item: (it), }))[0];
//     return __vituCapture((<ul>{[...(data)].map((it, i) =>
//       <li >{children ? children(__vituS0) : null}</li>)}</ul>), __vituS0);
//   }
//
// and on the consumer side r-slot="{ item }" turns the children into a render
// function whose parameter is typed from that captured slot type:
//
//   <List data={rows} r-slot="{ item }">{item.x}</List>
//   -> <List data={rows}>{(/** @type {(s: __VituSlots<typeof List>) => any} */
//        (({ item }) => <>{item.x}</>))}</List>        // .tsx uses `: type`
//
// (`__vituCapture` / `__VituSlots` live in the ambient d.ts the service adds.)
//
// `segments` map the item/index/expr/pattern spans; `identChunks` map
// everything copied verbatim; `scopes` are the source ranges where verbatim
// positions are also ours to answer (outside them the built-in TS server is
// responsible). `dialect` is 'js' (JSDoc glue) or 'ts' (type annotations).
function buildVirtual(text, opts) {
	const dialect = (opts && opts.dialect) || 'js';
	const { directives, shows, mutes, rslots, slotFns } = collectDirectives(text);

	let varCounter = 0;
	for (const f of slotFns) {
		for (const o of f.outlets) {
			o.varName = '__vituS' + varCounter++;
			// r-for scope chains around the outlet, outermost first: replayed
			// in the capture so the slot expressions see the loop bindings.
			o.chain = directives
				.filter((d) => d.elStart < o.elStart && o.elEnd <= d.elEnd)
				.sort((a, b) => a.elStart - b.elStart);
		}
		f.firstVar = f.outlets[0].varName;
	}

	const events = [];
	for (const d of directives) {
		events.push({ pos: d.elStart, order: 1, type: 'open', d });
		events.push({ pos: d.attrStart, order: 1, type: 'skip', end: d.attrEnd });
		events.push({ pos: d.elEnd, order: 0, type: 'close', d });
	}
	for (const d of shows) {
		events.push({ pos: d.attrStart, order: 1, type: 'show', d });
	}
	for (const r of rslots) {
		events.push({ pos: r.attrStart, order: 1, type: 'skip', end: r.attrEnd });
		events.push({ pos: r.openEnd, order: 1, type: 'rslotOpen', r });
		events.push({ pos: r.closeStart, order: 0, type: 'rslotClose', r });
	}
	for (const f of slotFns) {
		if (f.childrenInject) {
			events.push({
				pos: f.childrenInject.pos,
				order: 1,
				type: 'text',
				text: f.childrenInject.text,
			});
		}
		if (f.mode === 'block') {
			events.push({ pos: f.anchorPos, order: -3, type: 'caps', f });
			for (const ret of f.returns) {
				events.push({ pos: ret.exprStart, order: -1, type: 'wrapOpen' });
				events.push({
					pos: ret.exprEnd,
					order: 2,
					type: 'wrapClose',
					varName: f.firstVar,
				});
			}
		} else {
			events.push({ pos: f.bodyStart, order: -3, type: 'arrowOpen', f });
			events.push({
				pos: f.bodyEnd,
				order: 2,
				type: 'arrowClose',
				varName: f.firstVar,
			});
		}
		for (const o of f.outlets) {
			events.push({ pos: o.elStart, order: 1, type: 'slotOpen', o, f });
			if (!o.selfClosing) {
				events.push({ pos: o.closingStart, order: 0, type: 'slotClose', o });
			}
		}
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
		last = Math.max(last, pos);
	};

	const seg = (src, len, nav) => {
		segments.push({ src, gen: gen.length, len, nav });
		gen += text.slice(src, src + len);
	};

	// The capture expression for one outlet: the slot-props object literal,
	// replayed inside the outlet's r-for scope chains. Attr-value expressions
	// become mapped segments — this is their single generated copy.
	const emitCaptureExpr = (o) => {
		const nav = o.chain.length > 0;
		for (const d of o.chain) {
			gen += `[...(${d.expr})].map((${d.item}, ${d.index}) => `;
		}
		gen += '({ ';
		for (const a of o.attrs) {
			if (a.spread) {
				gen += '...(';
				seg(a.exprStart, a.exprEnd - a.exprStart, nav);
				gen += '), ';
			} else if (a.raw != null) {
				gen += `${a.name}: ${a.raw}, `;
			} else {
				gen += `${a.name}: (`;
				seg(a.exprStart, a.exprEnd - a.exprStart, nav);
				gen += '), ';
			}
		}
		gen += '})';
		gen += ')[0]'.repeat(o.chain.length);
	};

	const emitCaps = (f) => {
		for (const o of f.outlets) {
			const genStart = gen.length;
			gen += `const ${o.varName} = `;
			emitCaptureExpr(o);
			gen += '; ';
			regions.push({
				kind: 'slotCapture',
				keywordSrc: o.elStart,
				keywordLen: 0,
				valueSrcStart: o.elStart,
				valueSrcEnd: o.openingEnd,
				genStart,
				genEnd: gen.length,
				glueGenStart: genStart,
				styled: false,
			});
		}
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
				kind: 'for',
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
			last = Math.max(last, e.end); // the directive attribute is dropped
		} else if (e.type === 'show') {
			const d = e.d;
			// {expr} form outside any r-for: the expression is real code the
			// built-in TS server already answers (hover/completion/definition),
			// so our segment stays diagnostics-only to avoid duplicate answers.
			// The string form, and anything inside an r-for scope (where the
			// built-in server is blind to the loop bindings), is ours.
			const inFor = directives.some(
				(f) => d.attrStart > f.elStart && d.attrStart < f.elEnd
			);
			const regionGenStart = gen.length;
			let piece = '{...([true].includes((';
			segments.push({
				src: d.exprSrc,
				gen: regionGenStart + piece.length,
				len: d.expr.length,
				nav: d.quoted || inFor,
			});
			piece += d.expr + ')) ? {} : {})}';
			gen += piece;

			regions.push({
				kind: 'show',
				keywordSrc: d.valueSrcStart,
				keywordLen: 0, // r-show has no in/of/from keyword
				valueSrcStart: d.valueSrcStart,
				valueSrcEnd: d.valueSrcEnd,
				genStart: regionGenStart,
				genEnd: regionGenStart + piece.length,
				glueGenStart: regionGenStart,
				// The string form gets the "looks like code" decorations; the
				// {expr} form is real code the editor already styles.
				styled: d.quoted,
			});
			if (d.quoted) {
				// Only the expression span is ours; the element body introduces
				// no bindings and stays with the built-in TS server.
				scopes.push({
					srcStart: d.exprSrc,
					srcEnd: d.exprSrc + d.expr.length,
				});
			}
			last = Math.max(last, d.attrEnd); // the r-show attribute is dropped
		} else if (e.type === 'text') {
			gen += e.text;
		} else if (e.type === 'caps') {
			emitCaps(e.f);
		} else if (e.type === 'wrapOpen') {
			gen += '__vituCapture((';
		} else if (e.type === 'wrapClose') {
			gen += `), ${e.varName})`;
		} else if (e.type === 'arrowOpen') {
			gen += '{ ';
			emitCaps(e.f);
			gen += 'return __vituCapture((';
		} else if (e.type === 'arrowClose') {
			gen += `), ${e.varName}); }`;
		} else if (e.type === 'slotOpen') {
			const o = e.o;
			const ch = e.f.childrenExpr;
			const genStart = gen.length;
			if (!ch) {
				gen += o.selfClosing ? '{null}' : '{<>';
			} else if (o.selfClosing) {
				gen += `{${ch} ? ${ch}(${o.varName}) : null}`;
			} else {
				gen += `{${ch} ? ${ch}(${o.varName}) : <>`;
			}
			regions.push({
				kind: 'slot',
				keywordSrc: o.elStart,
				keywordLen: 0,
				valueSrcStart: o.elStart,
				valueSrcEnd: o.openingEnd,
				genStart,
				genEnd: gen.length,
				glueGenStart: genStart,
				styled: false,
			});
			last = Math.max(last, o.selfClosing ? o.elEnd : o.openingEnd);
		} else if (e.type === 'slotClose') {
			gen += '</>}';
			last = Math.max(last, e.o.elEnd);
		} else if (e.type === 'rslotOpen') {
			const r = e.r;
			const genStart = gen.length;
			// Children become a render function; the parameter is the r-slot
			// pattern, typed from the component's captured slot type. Without
			// a component tag the parameter stays untyped (plain any).
			let head;
			let mid;
			if (!r.tag) {
				head = '{((';
				mid = ') => <>';
			} else if (dialect === 'ts') {
				head = '{((';
				mid = `: __VituSlots<typeof ${r.tag}>) => <>`;
			} else {
				head = `{(/** @type {(s: __VituSlots<typeof ${r.tag}>) => any} */ ((`;
				mid = ') => <>';
			}
			gen += head;
			seg(r.patternSrc, r.pattern.length, true);
			gen += mid;

			regions.push({
				kind: 'rslot',
				keywordSrc: r.valueSrcStart,
				keywordLen: 0,
				valueSrcStart: r.valueSrcStart,
				valueSrcEnd: r.valueSrcEnd,
				genStart,
				genEnd: gen.length,
				glueGenStart: genStart,
				styled: true,
			});
			// The element body uses the slot bindings: those positions are
			// ours (the built-in server cannot resolve them).
			scopes.push({ srcStart: r.openEnd, srcEnd: r.closeStart });
		} else if (e.type === 'rslotClose') {
			gen += !e.r.tag || dialect === 'ts' ? '</>)}' : '</>))}';
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
