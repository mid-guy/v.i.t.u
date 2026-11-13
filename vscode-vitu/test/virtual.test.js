'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVirtual } = require('../lib/virtual');

const messages = (source) => buildVirtual(source).problems.map((p) => p.message);

test('r-for wraps the whole element in a map call', () => {
	const v = buildVirtual('<ul><li r-for="(item, i) in items">{item.x}</li></ul>;');
	assert.equal(
		v.text,
		'<ul>{__vituFor(items).map((item, i) => <li >{item.x}</li>)}</ul>;'
	);
});

test('r-if becomes a conditional with a boolean check', () => {
	const v = buildVirtual('<div><p r-if={ok}>yes</p></div>;');
	assert.equal(
		v.text,
		'<div>{(__vituBool((ok)), (ok)) ? <p >yes</p> : null}</div>;'
	);
});

test('r-else becomes the other branch of the r-if before it', () => {
	const v = buildVirtual('<div><p r-if={ok}>yes</p><p r-else>no</p></div>;');
	assert.equal(
		v.text,
		'<div>{(__vituBool((ok)), (ok)) ? <p >yes</p> : <p >no</p>}</div>;'
	);
});

test('r-if outside JSX children is parenthesized', () => {
	const v = buildVirtual('const a = <p r-if={ok}>yes</p>;');
	assert.equal(
		v.text,
		'const a = ((__vituBool((ok)), (ok)) ? <p >yes</p> : null);'
	);
});

test('r-for runs before r-if on the same element', () => {
	const v = buildVirtual('<ul><li r-for="(x, i) in xs" r-if={x.ok}>{x.n}</li></ul>;');
	assert.equal(
		v.text,
		'<ul>{__vituFor(xs).map((x, i) => (__vituBool((x.ok)), (x.ok)) ? <li  >{x.n}</li> : null)}</ul>;'
	);
});

test('r-else can carry r-for', () => {
	const v = buildVirtual(
		'<ul><li r-if={empty}>none</li><li r-else r-for="(x, i) in xs">{x}</li></ul>;'
	);
	assert.equal(
		v.text,
		'<ul>{(__vituBool((empty)), (empty)) ? <li >none</li> : __vituFor(xs).map((x, i) => <li  >{x}</li>)}</ul>;'
	);
});

test('r-show becomes a boolean-checked spread', () => {
	const v = buildVirtual('<p r-show={open}>x</p>;');
	assert.equal(v.text, '<p {...__vituBool((open))}>x</p>;');
});

test('a file without directives is left unchanged', () => {
	const v = buildVirtual('export const a = 1;\n');
	assert.equal(v.hasDirectives, false);
	assert.equal(v.text, 'export const a = 1;\n');
});

test('r-for with one binding is a problem', () => {
	assert.deepEqual(messages('<li r-for="item in items" />;'), [
		'Invalid r-for expression. Expected "(item, index) in items".',
	]);
});

test('r-for with a non-string value is a problem', () => {
	assert.deepEqual(messages('<li r-for={items} />;'), [
		'r-for expects a string value, e.g. r-for="(item, index) in items"',
	]);
});

test('r-if without an expression is a problem', () => {
	assert.deepEqual(messages('<p r-if="ok" />;'), [
		'r-if expects an expression, e.g. r-if={condition}',
	]);
});

test('r-show without an expression is a problem', () => {
	assert.deepEqual(messages('<p r-show />;'), [
		'r-show expects an expression, e.g. r-show={condition}',
	]);
});

test('r-else without an r-if before it is a problem', () => {
	assert.deepEqual(messages('<div><p r-else>no</p></div>;'), [
		'r-else must directly follow an element with r-if (and that element cannot also carry r-for)',
	]);
});

test('r-else separated from its r-if is a problem', () => {
	assert.deepEqual(messages('<div><p r-if={a} /><hr /><p r-else /></div>;'), [
		'r-else must directly follow an element with r-if (and that element cannot also carry r-for)',
	]);
});

test('r-else after r-for combined with r-if is a problem', () => {
	assert.deepEqual(
		messages('<ul><li r-for="(x, i) in xs" r-if={x} /><li r-else /></ul>;'),
		['r-else must directly follow an element with r-if (and that element cannot also carry r-for)']
	);
});

test('r-else with a value is a problem', () => {
	assert.deepEqual(messages('<div><p r-if={a} /><p r-else={b} /></div>;'), [
		'r-else takes no value',
	]);
});

test('r-else with r-if on the same element is a problem', () => {
	assert.deepEqual(messages('<div><p r-if={a} /><p r-else r-if={b} /></div>;'), [
		'r-else and r-if cannot be used on the same element',
	]);
});
