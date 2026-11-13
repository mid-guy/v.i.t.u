import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from './transform.js';

test('r-show toggles display through the style prop', () => {
	assert.equal(
		transform('<div r-show={ok}>x</div>;'),
		'<div style={{display:ok?"":"none"}}>x</div>;'
	);
});

test('r-show merges into an existing style object', () => {
	assert.equal(
		transform('<div r-show={ok} style={{ color: "red" }}>x</div>;'),
		'<div style={{color:"red",display:ok?"":"none"}}>x</div>;'
	);
});

test('r-show spreads a style that is not an object literal', () => {
	assert.equal(
		transform('<div r-show={ok} style={styles}>x</div>;'),
		'<div style={{...styles,display:ok?"":"none"}}>x</div>;'
	);
});

test('r-show rejects a string value', () => {
	assert.throws(
		() => transform('<div r-show="ok">x</div>;'),
		/r-show expects an expression/
	);
});

test('r-show works together with r-if', () => {
	assert.equal(
		transform('const a = <p r-if={a} r-show={b}>x</p>;'),
		'const a=a?<p style={{display:b?"":"none"}}>x</p>:null;'
	);
});
