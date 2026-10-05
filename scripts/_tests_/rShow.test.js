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
