import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from './transform.js';

test('r-for maps over the source and keys by index', () => {
	assert.equal(
		transform('<ul><li r-for="(item, index) in items">{item.name}</li></ul>;'),
		'<ul>{items.map((item,index)=><li key={index}>{item.name}</li>)}</ul>;'
	);
});

test('r-for accepts the of and from keywords', () => {
	for (const keyword of ['of', 'from']) {
		assert.equal(
			transform(`const a = <li r-for="(item, i) ${keyword} items">{item}</li>;`),
			'const a=items.map((item,i)=><li key={i}>{item}</li>);'
		);
	}
});

test('r-for keeps an explicit key', () => {
	assert.equal(
		transform('<ul><li r-for="(item, i) in items" key={item.id}>{item.name}</li></ul>;'),
		'<ul>{items.map((item,i)=><li key={item.id}>{item.name}</li>)}</ul>;'
	);
});

test('r-for accepts any expression as the source', () => {
	assert.equal(
		transform('const a = <li r-for="(user, i) in users.filter((u) => u.active)">{user.name}</li>;'),
		'const a=users.filter(u=>u.active).map((user,i)=><li key={i}>{user.name}</li>);'
	);
});

test('r-if on the same element can use the loop bindings', () => {
	assert.equal(
		transform('<ul><li r-for="(item, i) in items" r-if={item.ok}>{item.name}</li></ul>;'),
		'<ul>{items.map((item,i)=>item.ok?<li key={i}>{item.name}</li>:null)}</ul>;'
	);
});

test('r-for rejects the single-binding form', () => {
	assert.throws(
		() => transform('<li r-for="item in items">{item}</li>;'),
		/Invalid r-for expression "item in items"/
	);
});

test('r-for rejects a non-string value', () => {
	assert.throws(
		() => transform('<li r-for={items}>{item}</li>;'),
		/r-for expects a string value/
	);
});
