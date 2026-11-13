import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from './transform.js';

test('r-if renders the element or null', () => {
	assert.equal(
		transform('const a = <p r-if={ok}>yes</p>;'),
		'const a=ok?<p>yes</p>:null;'
	);
});

test('r-if as a JSX child is wrapped in an expression container', () => {
	assert.equal(
		transform('<div><p r-if={ok}>yes</p></div>;'),
		'<div>{ok?<p>yes</p>:null}</div>;'
	);
	assert.equal(
		transform('<><p r-if={ok}>yes</p></>;'),
		'<>{ok?<p>yes</p>:null}</>;'
	);
});

test('r-else pairs with the preceding r-if', () => {
	assert.equal(
		transform('<div><p r-if={ok}>yes</p><p r-else>no</p></div>;'),
		'<div>{ok?<p>yes</p>:<p>no</p>}</div>;'
	);
});

test('whitespace between r-if and r-else is allowed', () => {
	assert.equal(
		transform('<div>\n\t<p r-if={ok}>yes</p>\n\t<p r-else>no</p>\n</div>;'),
		'<div>\n\t{ok?<p>yes</p>:<p>no</p>}\n</div>;'
	);
});

test('r-else only pairs with the r-if directly before it', () => {
	assert.equal(
		transform('<div><p r-if={a}>1</p><p r-if={b}>2</p><p r-else>no</p></div>;'),
		'<div>{a?<p>1</p>:null}{b?<p>2</p>:<p>no</p>}</div>;'
	);
});

test('r-if rejects a missing value', () => {
	assert.throws(
		() => transform('<p r-if>yes</p>;'),
		/r-if expects an expression/
	);
});

test('r-if rejects a string value', () => {
	assert.throws(
		() => transform('<p r-if="ok">yes</p>;'),
		/r-if expects an expression/
	);
});

test('r-else without an r-if before it is an error', () => {
	assert.throws(
		() => transform('<div><p r-else>no</p></div>;'),
		/r-else must directly follow an element with r-if/
	);
});

test('r-else after an element that breaks the pairing is an error', () => {
	assert.throws(
		() => transform('<div><p r-if={a}>1</p><hr /><p r-else>no</p></div>;'),
		/r-else must directly follow an element with r-if/
	);
});

test('r-else after r-for combined with r-if is an error', () => {
	assert.throws(
		() => transform('<ul><li r-for="(x, i) in xs" r-if={x}>1</li><li r-else>no</li></ul>;'),
		/r-else must directly follow an element with r-if/
	);
});

test('r-else rejects a value', () => {
	assert.throws(
		() => transform('<div><p r-if={a}>1</p><p r-else={b}>no</p></div>;'),
		/r-else takes no value/
	);
});

test('r-else rejects r-if on the same element', () => {
	assert.throws(
		() => transform('<div><p r-if={a}>1</p><p r-else r-if={b}>2</p></div>;'),
		/r-else and r-if cannot be used on the same element/
	);
});

test('r-else can carry r-for', () => {
	assert.equal(
		transform('<ul><li r-if={empty}>none</li><li r-else r-for="(x, i) in xs">{x}</li></ul>;'),
		'<ul>{empty?<li>none</li>:xs.map((x,i)=><li key={i}>{x}</li>)}</ul>;'
	);
});
