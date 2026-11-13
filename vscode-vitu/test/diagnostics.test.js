'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('./helper');

// Wraps JSX in a component so each case only spells out what it tests.
const component = (declarations, jsx) => `
type User = { id: number; name: string };
declare const users: User[];
declare const maybe: User | undefined;
declare const value: string | number;
declare const open: boolean;
export function App() {
	${declarations}
	return <div>${jsx}</div>;
}
`;

test('correct directives produce no diagnostics', () => {
	const { diagnostics } = check(
		component(
			'',
			`<li r-for="(user, i) in users" r-if={user.id > 0} r-show={open}>{i} {user.name}</li>
			<p r-if={open}>yes</p>
			<p r-else>no</p>`
		)
	);
	assert.deepEqual(diagnostics(), []);
});

test('an unknown name in the r-for source is reported on that name', () => {
	const { diagnostics } = check(
		component('', '<li r-for="(user, i) in userz">{i}</li>')
	);
	assert.deepEqual(diagnostics(), [
		{ message: "Cannot find name 'userz'. Did you mean 'users'?", text: 'userz' },
	]);
});

test('a source that is not an array is reported', () => {
	const { diagnostics } = check(
		component('const set = new Set<string>();', '<li r-for="(s, i) in set">{s}{i}</li>')
	);
	const [d] = diagnostics();
	assert.equal(d.text, 'set');
	assert.match(d.message, /^r-for expects an array, got 'Set<string>'/);
});

test('a source that is not an array does not cascade into the body', () => {
	const { diagnostics } = check(
		component('const set = new Set<string>();', '<li r-for="(s, i) in set">{s}{i}</li>')
	);
	assert.equal(diagnostics().length, 1);
});

test('a wrong property on the loop item is reported in the body', () => {
	const { diagnostics } = check(
		component('', '<li r-for="(user, i) in users">{i} {user.nam}</li>')
	);
	assert.deepEqual(diagnostics(), [
		{
			message: "Property 'nam' does not exist on type 'User'. Did you mean 'name'?",
			text: 'nam',
		},
	]);
});

test('a wrong property in r-if on an r-for element is reported once', () => {
	const { diagnostics } = check(
		component('', '<li r-for="(user, i) in users" r-if={user.activ}>{i}</li>')
	);
	assert.deepEqual(diagnostics(), [
		{ message: "Property 'activ' does not exist on type 'User'.", text: 'activ' },
	]);
});

test('r-if narrows the element body', () => {
	const { diagnostics } = check(
		component('', '<p r-if={maybe !== undefined}>{maybe.name}</p>')
	);
	assert.deepEqual(diagnostics(), []);
});

test('r-else gets the opposite narrowing', () => {
	const { diagnostics } = check(
		component(
			'',
			`<p r-if={typeof value === 'string'}>{value.length}</p>
			<p r-else>{value.toFixed()}</p>`
		)
	);
	assert.deepEqual(diagnostics(), []);
});

test('a possibly undefined value is reported when r-if does not guard it', () => {
	const { diagnostics } = check(component('', '<p r-if={open}>{maybe.name}</p>'));
	assert.deepEqual(diagnostics(), [
		{ message: "'maybe' is possibly 'undefined'.", text: 'maybe' },
	]);
});

test('r-if rejects a condition that is not a boolean', () => {
	const { diagnostics } = check(component('', '<p r-if={value}>x</p>'));
	const [d] = diagnostics();
	assert.equal(d.text, 'value');
	assert.match(d.message, /^r-if expects a boolean, got 'string \| number'/);
});

test('r-show rejects a condition that is not a boolean', () => {
	const { diagnostics } = check(component('', '<p r-show={value}>x</p>'));
	const [d] = diagnostics();
	assert.equal(d.text, 'value');
	assert.match(d.message, /^r-show expects a boolean, got 'string \| number'/);
});

test('an error inside the r-if condition keeps the TypeScript message', () => {
	const { diagnostics } = check(
		component('const isLong = (s: string) => s.length > 3;', '<p r-if={isLong(42)}>x</p>')
	);
	const [d] = diagnostics();
	assert.equal(d.text, '42');
	assert.match(d.message, /^Argument of type 'number'/);
});

test('a syntax error inside the r-for string is reported', () => {
	const { diagnostics } = check(
		component('', '<li r-for="(user, i) in users.">{i}{user.id}</li>')
	);
	assert.ok(diagnostics().some((d) => d.message === 'Identifier expected.'));
});

test('a misused directive is reported with the type errors', () => {
	const { diagnostics } = check(component('', '<p r-else>x</p>'));
	assert.deepEqual(diagnostics(), [
		{
			message:
				'r-else must directly follow an element with r-if (and that element cannot also carry r-for)',
			text: 'r-else',
		},
	]);
});

test('errors outside directive elements are left to the built-in server', () => {
	const { diagnostics } = check(
		component('const n: number = "x";', '<p r-if={open}>{n}</p>')
	);
	assert.deepEqual(diagnostics(), []);
});

test('jsx files are checked too', () => {
	const { diagnostics } = check(
		`export function App() {
			const items = [{ label: 'one' }];
			return <ul><li r-for="(item, i) in items">{i} {item.labl}</li></ul>;
		}`,
		'jsx'
	);
	assert.equal(diagnostics().length, 1);
	assert.equal(diagnostics()[0].text, 'labl');
});

test('hover on the loop item shows the element type', () => {
	const { hover } = check(component('', '<li r-for="(user, i) in users">{user.name}</li>'));
	assert.equal(hover('(user, i)', 1), '(parameter) user: User');
});

test('hover on the loop index shows number', () => {
	const { hover } = check(component('', '<li r-for="(user, i) in users">{user.name}</li>'));
	assert.equal(hover('(user, i)', 7), '(parameter) i: number');
});

test('hover in an r-if body shows the narrowed type', () => {
	const { hover } = check(
		component('', '<p r-if={maybe !== undefined}>{maybe.name}</p>')
	);
	assert.equal(hover('{maybe.name}', 1), 'const maybe: User');
});

test('completion in the body lists the members of the loop item', () => {
	const { completions } = check(
		component('', '<li r-for="(user, i) in users">{i} {user.name}</li>')
	);
	assert.deepEqual(completions('{user.').sort(), ['id', 'name']);
});

test('completion in the r-for source lists variables in scope', () => {
	const { completions } = check(
		component('', '<li r-for="(user, i) in users">{i} {user.name}</li>')
	);
	assert.ok(completions('in us').includes('users'));
});

test('positions outside directive elements are not answered', () => {
	const { at } = check(component('', '<li r-for="(user, i) in users">{i}{user.id}</li>'));
	assert.equal(at('declare const users'), null);
});

test('an r-show expression outside any scope is left to the built-in server', () => {
	const { at } = check(component('', '<p r-show={open}>x</p>'));
	assert.equal(at('open}'), null);
});
