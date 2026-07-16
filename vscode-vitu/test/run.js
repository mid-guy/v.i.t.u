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

console.log('\nAll checks passed.');
