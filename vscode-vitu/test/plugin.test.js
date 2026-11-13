'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const init = require('../typescript-vitu-plugin');
const { createVituService } = require('../lib/service');
const { fixtureDir } = require('./helper');

// Stands in for VSCode's built-in TypeScript server: a language service on
// the original source (not the virtual document), wrapped by the plugin.
const fileName = path.join(fixtureDir, 'Plugin.tsx');
const builtin = createVituService(fixtureDir);
const plugin = init({ typescript: ts }).create({ languageService: builtin.ls });
let version = 0;

function open(source) {
	builtin.upsert(fileName, source, ++version);
	const codes = (diagnostics) => diagnostics.map((d) => d.code);
	return {
		before: codes(builtin.ls.getSemanticDiagnostics(fileName)),
		after: codes(plugin.getSemanticDiagnostics(fileName)),
		hover: (needle) => plugin.getQuickInfoAtPosition(fileName, source.indexOf(needle)),
	};
}

test('unresolved loop bindings inside an r-for element are muted', () => {
	const { before, after } = open(`
		declare const users: { name: string }[];
		export const a = <li r-for="(user, i) in users">{i} {user.name}</li>;
	`);
	assert.deepEqual(before, [2304, 2552]);
	assert.deepEqual(after, []);
});

test('errors the built-in server cannot narrow inside r-if are muted', () => {
	const { before, after } = open(`
		declare const maybe: { name: string } | undefined;
		export const a = <p r-if={maybe !== undefined}>{maybe.name}</p>;
	`);
	assert.deepEqual(before, [18048]);
	assert.deepEqual(after, []);
});

test('a variable used only in an r-for string is not reported as unused', () => {
	const { before, after } = open(`
		export function App() {
			const users = [{ name: 'An' }];
			return <li r-for="(user, i) in users">x</li>;
		}
	`);
	assert.deepEqual(before, [6133]);
	assert.deepEqual(after, []);
});

test('a variable that is really unused is still reported', () => {
	const { after } = open(`
		export function App() {
			const users = [{ name: 'An' }];
			const other = 1;
			return <li r-for="(user, i) in users">x</li>;
		}
	`);
	assert.deepEqual(after, [6133]);
});

test('errors outside directive elements are kept', () => {
	const { after } = open(`
		export const n: number = 'x';
		export const a = <p r-if={true}>x</p>;
	`);
	assert.deepEqual(after, [2322]);
});

test('hover inside a directive element is left to the extension', () => {
	const { hover } = open(`
		declare const users: { name: string }[];
		export const a = <li r-for="(user, i) in users">{users.length}</li>;
	`);
	assert.equal(hover('users.length'), undefined);
});

test('hover outside directive elements is untouched', () => {
	const { hover } = open(`
		declare const users: { name: string }[];
		export const a = <li r-for="(user, i) in users">{users.length}</li>;
	`);
	assert.ok(hover('users: {'));
});
