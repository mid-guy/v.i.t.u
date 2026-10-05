# babel-plugin-v.i.t.u

**V.I.T.U — Vue Is That You?**

[![npm](https://img.shields.io/npm/v/babel-plugin-v.i.t.u.svg)](https://www.npmjs.com/package/babel-plugin-v.i.t.u)
[![CI](https://github.com/mid-guy/v.i.t.u/actions/workflows/ci.yml/badge.svg)](https://github.com/mid-guy/v.i.t.u/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/babel-plugin-v.i.t.u.svg)](LICENSE)

A Babel plugin that brings Vue-style template directives to React JSX. The
directives are compiled away at build time into plain JSX, so nothing is added
to your bundle.

```jsx
<ul>
	<li r-for="(todo, i) in todos" r-if={!todo.done}>
		{i + 1}. {todo.title}
	</li>
</ul>
```

| Directive           | Vue equivalent | Compiles to                             |
| ------------------- | -------------- | --------------------------------------- |
| [`r-if`](#r-if--r-else) | `v-if`     | `cond ? <el /> : null`                  |
| [`r-else`](#r-if--r-else) | `v-else` | the `:` branch of the preceding `r-if`  |
| [`r-show`](#r-show) | `v-show`       | `style={{ display: cond ? '' : 'none' }}` |
| [`r-for`](#r-for)   | `v-for`        | `items.map((item, index) => <el />)`    |
| [`<slot>` / `r-slot`](#scoped-slots) | scoped slots | a `children` render function |

## Installation

```bash
npm install --save-dev babel-plugin-v.i.t.u
# or
pnpm add -D babel-plugin-v.i.t.u
# or
yarn add -D babel-plugin-v.i.t.u
```

`@babel/core` 7 is a peer dependency.

> The directives documented here are on `main`. The latest version on npm may
> not include all of them yet — see the [changelog](CHANGELOG.md).

## Setup

Add the plugin to your Babel configuration (`babel.config.js`, `.babelrc`, or
the `babel-loader` options). It runs on JSX, so keep your usual React preset:

```json
{
	"presets": ["@babel/preset-react"],
	"plugins": ["babel-plugin-v.i.t.u"]
}
```

### TypeScript

The package ships type declarations for the directive attributes. Reference
them once from any `.d.ts` file included in your project:

```ts
/// <reference types="babel-plugin-v.i.t.u/types" />
```

## Directives

### `r-if` / `r-else`

Renders the element only when the condition is truthy. An `r-else` element
must come directly after the `r-if` element it belongs to (whitespace between
them is fine).

```jsx
<div>
	<p r-if={isLoggedIn}>You are logged in.</p>
	<p r-else>Please log in.</p>
</div>
```

compiles to

```jsx
<div>
	{isLoggedIn ? <p>You are logged in.</p> : <p>Please log in.</p>}
</div>
```

Without an `r-else`, the other branch is `null`.

### `r-show`

Keeps the element mounted and toggles its `display` style. An existing `style`
object is preserved.

```jsx
<div r-show={isOpen} style={{ color: 'red' }}>Details</div>
```

compiles to

```jsx
<div style={{ color: 'red', display: isOpen ? '' : 'none' }}>Details</div>
```

### `r-for`

Repeats the element for every entry of an array. The value is a string of the
form `"(item, index) in source"`; `of` and `from` are accepted in place of
`in`, and `source` can be any expression.

```jsx
<ul>
	<li r-for="(user, i) in users.filter((u) => u.active)">{user.name}</li>
</ul>
```

compiles to

```jsx
<ul>
	{users.filter((u) => u.active).map((user, i) => (
		<li key={i}>{user.name}</li>
	))}
</ul>
```

- `key={index}` is added when the element has no `key`. Pass your own `key`
  for lists that reorder.
- Both bindings are required: `r-for="item in items"` is a compile error.
- `r-for` is applied before `r-if` on the same element, so the condition can
  use the loop bindings.

### Scoped slots

`<slot>` inside a component passes data outward; `r-slot` at the call site
receives it. This is Vue's scoped-slot pattern, compiled to a React render
prop.

```jsx
function List({ rows }) {
	return (
		<ul>
			<li r-for="(row, i) in rows">
				<slot item={row} index={i}>nothing passed</slot>
			</li>
		</ul>
	);
}

<List rows={rows} r-slot="{ item, index }">
	<b>{index} - {item.label}</b>
</List>;
```

compiles to

```jsx
function List({ children, rows }) {
	return (
		<ul>
			{rows.map((row, i) => (
				<li key={i}>
					{typeof children === 'function'
						? children({ item: row, index: i })
						: <>nothing passed</>}
				</li>
			))}
		</ul>
	);
}

<List rows={rows}>
	{({ item, index }) => <><b>{index} - {item.label}</b></>}
</List>;
```

- The `children` binding is added to the component's props when it is not
  already destructured.
- A `<slot>` used without a matching `r-slot` renders its own children as a
  fallback, or nothing.
- `v-slot` is accepted as an alias of `r-slot`.

## Editor support

[`vscode-vitu/`](vscode-vitu/) contains a VSCode extension that adds
completion, hover, go-to-definition and diagnostics inside `r-for` strings and
scoped slots, with slot types inferred from the component. It is not published
to the Marketplace yet; see its [README](vscode-vitu/README.md) (Vietnamese)
for how to run it locally.

## Repository layout

| Path            | Contents                                         |
| --------------- | ------------------------------------------------ |
| `scripts/`      | Plugin source, type declarations and tests       |
| `example/js/`   | Webpack + React app that uses the plugin         |
| `vscode-vitu/`  | VSCode extension and tsserver plugin             |
| `DEVLOG.md`     | Development diary (Vietnamese)                   |

## Development

```bash
pnpm install
pnpm test     # plugin tests (node:test)
pnpm build    # bundle scripts/index.cjs into dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Contributing

Bug reports, ideas and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first. To report a vulnerability, follow
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © mid-guy
