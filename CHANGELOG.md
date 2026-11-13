# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project follows [Semantic Versioning](https://semver.org/).

The reasoning behind each entry — what went wrong and how it was fixed — is in
[DEVLOG.md](DEVLOG.md).

## [Unreleased]

### Added

- `r-for` — list rendering like Vue's `v-for`. The only accepted form is
  `r-for="(item, index) in items"` (`in`, `of` or `from`). `key={index}` is
  added when the element has no `key`, and `r-for` is applied before `r-if` so
  the condition can use the loop bindings. (DEVLOG #1, #3)
- `r-else` and `r-show` directives.
- Compile errors for misused directives: `r-if` / `r-show` without an
  `{expression}`, an `r-else` that does not directly follow an `r-if` element,
  `r-else` with a value, and `r-else` together with `r-if` on one element.
  Previously these crashed the plugin or leaked the attribute to the DOM.
  (DEVLOG #13)
- `vscode-vitu` extension (0.1.0): completion, hover, go-to-definition and
  diagnostics for `r-for`, both inside the directive string and in the element
  body, for JSX and TSX. (DEVLOG #4, #5)
- `vscode-vitu`: `r-if` / `r-else` are checked as the conditional they compile
  to, so the element body is narrowed by the condition; `r-if` and `r-show`
  conditions must be boolean; an `r-for` source must be an array; misused
  directives are underlined with the same message as the compile error.
  (DEVLOG #13)
- `vscode-vitu`: directive highlighting through a TextMate grammar, the way
  Volar highlights `v-for` / `v-if`: `r-for`, `r-if` and `r-else` are coloured
  as keywords and the `r-for` value as code, all from the active theme.
  Type errors on a whole directive read in directive terms
  (`r-if expects a boolean, got 'string'`), and a non-array `r-for` source no
  longer causes follow-up errors in the element body. (DEVLOG #14)
- `vscode-vitu`: the project's `tsconfig.json` / `jsconfig.json` compiler
  options (`strict`, `paths`, ...) are used when checking directives.
- `typescript-vitu-plugin` — a tsserver plugin that mutes what the built-in
  TypeScript service gets wrong inside directive elements: the `any` hover and
  `Cannot find name` errors for loop bindings, errors `r-if` narrows away, and
  "declared but never read" for variables used only in an `r-for` string.
  (DEVLOG #6, #13)
- `.vscode/launch.json` at the repo root and in `vscode-vitu/`, and a
  `test:debug` script, to run the extension and debug its smoke tests.
- Tests for every directive (`pnpm test`), and a CI workflow that runs them on
  Node 18, 20 and 22.
- `exports` map with ESM and CommonJS entry points, and a
  `babel-plugin-v.i.t.u/types` entry for the type declarations.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and issue and pull
  request templates.

### Changed

- `r-for` accepts only `(item, index) in items`; the `item in items` form was
  removed. (DEVLOG #3)
- `r-else` now pairs only with the `r-if` element directly before it, both
  being JSX children. Previously it paired with the first `r-if` above it and
  every element in between was silently dropped. (DEVLOG #12)
- `@babel/core` is declared as a peer dependency.
- Publishing happens only when a `v*` tag is pushed; the workflows that tried
  to publish on every push to `main` were removed.
- `dist/` is no longer committed; it is built at publish time.
- The repository uses pnpm only; the `yarn.lock` files were removed.
- The `LICENSE` file is now MIT, matching `package.json` and the versions
  already published to npm. It previously contained the Apache-2.0 text.

### Removed

- Scoped slots (`<slot>` / `r-slot`). They were only ever on `main`, never in
  a published version. The project now focuses on `r-if`, `r-else`, `r-show`
  and `r-for`. (DEVLOG #13)

### Fixed

- `r-show` on an element whose `style` is not an object literal
  (`style={styles}`) crashed the plugin; the style is now spread and `display`
  applied on top.

- `r-if` on a JSX child was emitted as a bare expression instead of inside an
  expression container, so the compiled output printed as text
  (`<div>ok ? <p /> : null</div>`). (DEVLOG #12)
- `r-else` was written to the DOM (React warned "Received `true` for a
  non-boolean attribute") because `_removeAttr` always removed the attribute
  from the `r-if` element instead of the `r-else` element. (DEVLOG #2)
- `vscode-vitu`: `collectDirectives` used the `shows` array without declaring
  it, which threw `ReferenceError: shows is not defined`.
- `rollup.config.cjs` pointed at `scripts/index.js` and `src/types.d.ts`,
  neither of which exists, so `pnpm build` failed.

## [1.0.1] - 2024-11-06

Published to npm; no changelog entry was recorded for this version.

## [1.0.0] - 2024-11-03

### Added

- Initial release of `babel-plugin-v.i.t.u` plugin.
- Experimental support for the `r-if` feature.

[Unreleased]: https://github.com/mid-guy/v.i.t.u/compare/1.0.0...HEAD
[1.0.0]: https://github.com/mid-guy/v.i.t.u/releases/tag/1.0.0
