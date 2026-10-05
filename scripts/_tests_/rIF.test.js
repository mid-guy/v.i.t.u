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

test('an element between r-if and r-else is kept and breaks the pairing', () => {
	const out = transform('<div><p r-if={a}>1</p><hr /><p r-else>no</p></div>;');
	assert.match(out, /\{a\?<p>1<\/p>:null\}<hr\/>/);
});
