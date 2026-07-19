'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const ts = require('typescript');
const { buildVirtual, srcOffsetToGen, genRangeToSrc } = require('../lib/virtual');
const { createVituService } = require('../lib/service');

const fixture = path.join(__dirname, 'fixture', 'App.jsx');
const text = fs.readFileSync(fixture, 'utf8');

// 1. Virtual document generation
const v = buildVirtual(text);
console.log('--- virtual document ---');
console.log(v.text);
assert(v.hasDirectives, 'directives detected');
assert(
	v.text.includes("{[...(texts)].map((text, ti) => <p >{'row'}</p>)}"),
	'r-for element wrapped whole'
);
assert(
	v.text.includes("{[...(itemz)].map((item, ii) => <span >{'row'}</span>)}"),
	'second directive rewritten'
);
assert(
	v.text.includes('{[...(items)].map((entry, i) => <li >{entry.label}</li>)}'),
	'third directive rewritten with children intact'
);

const service = createVituService(path.dirname(fixture));
service.upsert(fixture, v.text, 1);

// 2. Diagnostics: only errors inside directives survive the mapping
const raw = [
	...service.ls.getSyntacticDiagnostics(fixture),
	...service.ls.getSemanticDiagnostics(fixture),
];
const mapped = [];
for (const d of raw) {
	if (d.start == null) continue;
	const m = genRangeToSrc(v, d.start, d.start + (d.length || 1));
	if (!m) continue;
	mapped.push({
		message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
		sourceText: text.slice(m.start, m.end),
	});
}
console.log('--- mapped diagnostics ---');
console.log(mapped);
assert(
	mapped.some((d) => d.message.includes("Cannot find name 'itemz'")),
	"reports Cannot find name 'itemz'"
);
assert(
	!mapped.some((d) => d.message.includes('react/jsx-runtime')),
	'unrelated diagnostics are filtered out'
);

// 3. Completions inside the expression part of the directive
const exprStart = text.indexOf('from texts') + 'from '.length;
const cursor = exprStart + 3; // after "tex"
const genPos = srcOffsetToGen(v, cursor);
assert(genPos != null, 'cursor inside directive maps into virtual doc');
const completions = service.ls.getCompletionsAtPosition(fixture, genPos, {});
assert(completions, 'completions returned');
const names = completions.entries.map((e) => e.name);
assert(names.includes('texts'), "completion list includes 'texts'");
assert(names.includes('items'), "completion list includes 'items'");
console.log('--- completions --- includes texts/items, total:', names.length);

// 4. Hover on the item binding shows the inferred element type
const itemPos = text.indexOf('(text, ti)') + 1;
const itemGenPos = srcOffsetToGen(v, itemPos + 1);
const quickInfo = service.ls.getQuickInfoAtPosition(fixture, itemGenPos);
assert(quickInfo, 'quick info returned');
const hover = ts.displayPartsToString(quickInfo.displayParts);
console.log('--- hover on item ---');
console.log(hover);
assert(hover.includes('string'), 'item binding is inferred as string');

// 4b. Hover on the (item, index) bindings: element type and number index
const entryPos = text.indexOf('(entry, i) in') + '('.length;
const entryInfo = service.ls.getQuickInfoAtPosition(
	fixture,
	srcOffsetToGen(v, entryPos + 1)
);
assert(entryInfo, 'quick info for entry returned');
const entryHover = ts.displayPartsToString(entryInfo.displayParts);
console.log('--- hover on entry ---');
console.log(entryHover);
assert(entryHover.includes('id'), 'entry binding infers the object element type');
const idxPos = text.indexOf('(entry, i) in') + '(entry, '.length;
const idxInfo = service.ls.getQuickInfoAtPosition(fixture, srcOffsetToGen(v, idxPos));
assert(idxInfo, 'quick info for index returned');
const idxHover = ts.displayPartsToString(idxInfo.displayParts);
console.log('--- hover on index ---');
console.log(idxHover);
assert(idxHover.includes('number'), 'index binding is inferred as number');

// 4c. Bindings are visible inside the element body: hover + member completion
const bodyPos = text.indexOf('{entry.label}') + 2;
const bodyInfo = service.ls.getQuickInfoAtPosition(fixture, srcOffsetToGen(v, bodyPos));
assert(bodyInfo, 'quick info inside element body returned');
const bodyHover = ts.displayPartsToString(bodyInfo.displayParts);
console.log('--- hover on entry in body ---');
console.log(bodyHover);
assert(bodyHover.includes('id'), 'body binding infers the object element type');
const dotPos = text.indexOf('entry.label') + 'entry.'.length;
const bodyCompletions = service.ls.getCompletionsAtPosition(
	fixture,
	srcOffsetToGen(v, dotPos),
	{}
);
assert(bodyCompletions, 'body completions returned');
const bodyNames = bodyCompletions.entries.map((e) => e.name);
assert(bodyNames.includes('label'), "body completion includes 'label'");
assert(bodyNames.includes('id'), "body completion includes 'id'");
console.log('--- body completions ---', bodyNames.join(', '));

// 5. Cursor outside a directive maps to nothing (built-in TS takes over)
assert(srcOffsetToGen(v, text.indexOf('const texts')) == null, 'outside positions unmapped');

// 6. Data used by editor decorations: keyword span + semantic classifications
const r0 = v.regions[0];
assert.strictEqual(
	text.slice(r0.keywordSrc, r0.keywordSrc + r0.keywordLen),
	'from',
	'keyword span maps to "from"'
);
const exprSeg = v.segments[0];
const classified = service.ls.getEncodedSemanticClassifications(
	fixture,
	{ start: exprSeg.gen, length: exprSeg.len },
	ts.SemanticClassificationFormat.TwentyTwenty
);
// spans come as [start, length, encoding] triplets; type = (encoding >> 8) - 1
const TS_TOKEN_TYPES = [
	'class', 'enum', 'interface', 'namespace', 'typeParameter', 'type',
	'parameter', 'variable', 'enumMember', 'property', 'function', 'member',
];
const kinds = [];
for (let i = 0; i < classified.spans.length; i += 3) {
	kinds.push(TS_TOKEN_TYPES[(classified.spans[i + 2] >> 8) - 1]);
}
console.log('--- expr classifications ---', kinds);
assert(kinds.includes('variable'), "expr 'texts' classified as variable");

// 7. Scoped slots: <slot> outlets type the r-slot bindings with no
// annotation from the author, in the same file and across imports.
function slotCase(file, dialect) {
	const src = fs.readFileSync(file, 'utf8');
	const virtual = buildVirtual(src, { dialect });
	const svc = createVituService(path.dirname(file));
	svc.upsert(file, virtual.text, 1);
	const diags = [];
	for (const d of [
		...svc.ls.getSyntacticDiagnostics(file),
		...svc.ls.getSemanticDiagnostics(file),
	]) {
		if (d.start == null) continue;
		const m = genRangeToSrc(virtual, d.start, d.start + (d.length || 1));
		if (!m) continue;
		diags.push({
			message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
			sourceText: src.slice(m.start, m.end),
		});
	}
	const hover = (needle, off) => {
		const gen = srcOffsetToGen(virtual, src.indexOf(needle) + off);
		assert(gen != null, `position inside slot body maps: ${needle}`);
		const info = svc.ls.getQuickInfoAtPosition(file, gen);
		assert(info, `quick info returned: ${needle}`);
		return ts.displayPartsToString(info.displayParts);
	};
	const members = (needle) => {
		const gen = srcOffsetToGen(virtual, src.indexOf(needle) + needle.length);
		const info = svc.ls.getCompletionsAtPosition(file, gen, {});
		return info ? info.entries.map((e) => e.name) : [];
	};
	return { src, virtual, diags, hover, members };
}

const jsSlot = slotCase(path.join(__dirname, 'fixture', 'Slot.jsx'), 'js');
console.log('--- slot virtual (js) ---');
console.log(jsSlot.virtual.text);
assert(
	jsSlot.virtual.text.includes(
		'const __vituS0 = [...(data)].map((entry, i) => ({ item: (entry), index: (i), }))[0];'
	),
	'outlet capture replays the enclosing r-for scope'
);
assert(
	jsSlot.virtual.text.includes('__vituCapture(('),
	'component returns are wrapped so the slot type rides out'
);
assert(
	jsSlot.virtual.text.includes(
		'@type {(s: __VituSlots<typeof Local>) => any}'
	),
	'r-slot children become a typed render function'
);

const localItemHover = jsSlot.hover('item.label', 1);
console.log('--- hover slot binding (js, same file) ---');
console.log(localItemHover);
assert(
	localItemHover.includes('id') && localItemHover.includes('label'),
	'slot binding is typed from the <slot> outlet, with no children annotation'
);
assert(
	jsSlot.hover('<i>{index}</i>', '<i>{i'.length).includes('number'),
	'slot index binding is typed from the outlet expression'
);
assert.deepStrictEqual(
	jsSlot.members('item.').sort(),
	['id', 'label'],
	'slot binding completes its members'
);
const importedHover = jsSlot.hover('{item.label}</b>\n\t\t\t</List>', 2);
console.log('--- hover slot binding (js, imported component) ---');
console.log(importedHover);
assert(
	importedHover.includes('label'),
	'slot types flow across imports (List from ./Slots)'
);
console.log('--- slot diagnostics (js) ---', jsSlot.diags);
assert(
	jsSlot.diags.some(
		(d) => d.sourceText === 'nope' && d.message.includes("Property 'nope'")
	),
	'a wrong member on a slot binding is reported'
);
assert(
	!jsSlot.diags.some((d) => d.message.includes("'children'")),
	'the injected children prop never surfaces as a user error'
);

const tsSlot = slotCase(path.join(__dirname, 'fixture', 'Slot.tsx'), 'ts');
assert(
	tsSlot.virtual.text.includes('__VituSlots<typeof Table>) =>'),
	'the .tsx dialect annotates the render function directly'
);
const cellHover = tsSlot.hover('cell.label', 1);
console.log('--- hover slot binding (tsx) ---');
console.log(cellHover);
assert(cellHover.includes('Row'), 'tsx slot binding resolves to the Row type');
assert(
	tsSlot.hover('{index}</td>', 1).includes('number'),
	'tsx slot index binding is a number'
);
console.log('--- slot diagnostics (tsx) ---', tsSlot.diags);
assert(
	tsSlot.diags.some(
		(d) => d.sourceText === 'missing' && d.message.includes("Property 'missing'")
	),
	'tsx reports a wrong member on the slot binding'
);
assert(
	!tsSlot.diags.some((d) => d.message.includes("'children'")),
	'tsx children glue stays invisible'
);

// 8. A file with no directives is untouched.
const plain = buildVirtual('export const a = 1;\n');
assert(!plain.hasDirectives, 'plain file reports no directives');
assert.strictEqual(plain.text, 'export const a = 1;\n', 'plain file unchanged');

console.log('\nAll checks passed.');
