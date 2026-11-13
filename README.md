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
them is fine), as JSX children of the same parent.

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
is preserved.

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

### Compile errors

A directive the plugin cannot compile stops the build with a code frame
instead of producing broken output:

| Mistake                                             | Error                                             |
| --------------------------------------------------- | ------------------------------------------------- |
| `r-if` / `r-show` without `{expression}` (`r-if="ok"`) | `r-if expects an expression`                   |
| `r-for={items}`, or a string in another shape       | `r-for expects a string value` / `Invalid r-for expression` |
| `r-else` that does not directly follow an `r-if` element | `r-else must directly follow an element with r-if` |
| `r-else={x}`                                        | `r-else takes no value`                           |
| `r-else` and `r-if` on the same element             | `r-else and r-if cannot be used on the same element` |

An element that carries both `r-for` and `r-if` cannot take an `r-else`: the
condition runs once per item, inside the loop.

## Editor support

[`vscode-vitu/`](vscode-vitu/) contains a VSCode extension that type-checks
the directives as they will run: completion, hover and go-to-definition inside
`r-for` strings and element bodies, type narrowing from `r-if` / `r-else`, and
the compile errors above shown as you type. It is not published to the
Marketplace yet; see its [README](vscode-vitu/README.md) for how to run it
locally. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the plugin and the
extension fit into the standard React and TypeScript toolchain.

## Repository layout

| Path            | Contents                                         |
| --------------- | ------------------------------------------------ |
| `scripts/`      | Plugin source, type declarations and tests       |
| `example/js/`   | Webpack + React app that uses the plugin         |
| `vscode-vitu/`  | VSCode extension and tsserver plugin             |
| `ARCHITECTURE.md` | How the plugin and the extension work (diagrams) |
| `DEVLOG.md`     | Development diary                                |

## Development

```bash
pnpm install
pnpm test     # plugin tests (node:test)
pnpm build    # bundle scripts/index.cjs into dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Changelog

The full history is in [CHANGELOG.md](CHANGELOG.md).

- **Unreleased** (on `main`) — `r-else`, `r-show`, `r-for`, compile errors
  for misused directives, the `vscode-vitu` extension, and fixes to how `r-if`
  and `r-else` compile.
- **1.0.1** (2024-11-06) — published to npm.
- **1.0.0** (2024-11-03) — initial release with the `r-if` directive.

## Contributing

Bug reports, ideas and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first. To report a vulnerability, follow
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © mid-guy
