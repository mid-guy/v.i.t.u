import test from 'node:test';
import assert from 'node:assert/strict';
import { transform } from './transform.js';

test('r-slot turns children into a render function', () => {
	assert.equal(
		transform('<List rows={rows} r-slot="{ item, index }"><b>{item.label}</b></List>;'),
		'<List rows={rows}>{({item,index})=><><b>{item.label}</b></>}</List>;'
	);
});

test('v-slot is an alias of r-slot', () => {
	assert.equal(
		transform('<List v-slot="{ item }"><b>{item}</b></List>;'),
		'<List>{({item})=><><b>{item}</b></>}</List>;'
	);
});

test('r-slot rejects a non-string value', () => {
	assert.throws(
		() => transform('<List r-slot={x}><b /></List>;'),
		/r-slot expects a string binding pattern/
	);
});

test('<slot> calls children with its attributes and falls back to its own children', () => {
	assert.equal(
		transform('function Box({ value }) { return <div><slot value={value}>fallback</slot></div>; }'),
		'function Box({children,value}){return<div>{typeof children==="function"?children({value:value}):<>fallback</>}</div>;}'
	);
});

test('<slot> without children falls back to null', () => {
	assert.equal(
		transform('function Box() { return <div><slot /></div>; }'),
		'function Box({children}){return<div>{typeof children==="function"?children({}):null}</div>;}'
	);
});

test('<slot> reads children off a props identifier', () => {
	assert.equal(
		transform('function Box(props) { return <div><slot value={props.v} /></div>; }'),
		'function Box(props){return<div>{typeof props.children==="function"?props.children({value:props.v}):null}</div>;}'
	);
});

test('<slot> reuses an already destructured children binding', () => {
	const out = transform('function Box({ children: kids }) { return <div><slot /></div>; }');
	assert.match(out, /typeof kids==="function"\?kids\(\{\}\)/);
});

test('<slot> inside r-for reaches the component children, not the loop callback', () => {
	assert.equal(
		transform('function List({ rows }) { return <ul><li r-for="(row, i) in rows"><slot item={row} index={i} /></li></ul>; }'),
		'function List({children,rows}){return<ul>{rows.map((row,i)=><li key={i}>{typeof children==="function"?children({item:row,index:i}):null}</li>)}</ul>;}'
	);
});
