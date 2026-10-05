# Contributing

Thanks for taking the time to contribute. This document covers how to set the
project up, what a change needs before it can be merged, and how releases are
cut.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open an issue with the bug report template. The most
  useful reports include the JSX you wrote, what it compiled to, and what you
  expected.
- **Propose a directive or a change in behaviour** — open a feature request
  first so the syntax can be discussed before any code is written.
- **Send a pull request** — small, focused PRs are reviewed fastest.

Security problems should not be reported in public issues; see
[SECURITY.md](SECURITY.md).

## Project layout

| Path                    | Contents                                                |
| ----------------------- | ------------------------------------------------------- |
| `scripts/index.cjs`     | The Babel plugin                                        |
| `scripts/types.d.ts`    | Type declarations for the directive attributes          |
| `scripts/_tests_/`      | Plugin tests (`node:test`)                              |
| `example/js/`           | Webpack + React app wired to the local plugin source    |
| `vscode-vitu/`          | VSCode extension, with its own `package.json` and tests |
| `DEVLOG.md`             | Development diary: what went wrong, why, and the fix    |

## Setup

You need Node.js 18 or newer and [pnpm](https://pnpm.io). The repository uses
pnpm for every package.

```bash
git clone https://github.com/mid-guy/v.i.t.u.git
cd v.i.t.u
pnpm install
```

### Babel plugin

```bash
pnpm test     # run the plugin tests
pnpm build    # bundle into dist/ (ESM + CommonJS + types)
```

To try a change in a real app:

```bash
cd example/js
pnpm install
pnpm dev      # webpack dev server, loads ../../scripts/index.cjs directly
```

### VSCode extension

```bash
cd vscode-vitu
pnpm install
pnpm test         # smoke tests for the language service, no VSCode needed
pnpm test:debug   # same, paused under the Node inspector
```

Press **F5** in VSCode (from the repo root or from `vscode-vitu/`) to launch an
Extension Development Host.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make the change. Match the surrounding style: tabs for indentation, single
   quotes, semicolons.
3. Add or update tests. Every directive behaviour has a test in
   `scripts/_tests_/` that asserts on the compiled output; a bug fix should
   come with a test that fails without it.
4. Check a change in generated code by rendering it, not only by reading the
   output — the example app is the quickest way.
5. Add an entry under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for
   anything a user of the plugin or extension would notice.
6. Run `pnpm test` (and `pnpm test` in `vscode-vitu/` if you touched it), then
   open a pull request against `main`.

The plugin and the extension parse the same directive grammar. A change to
directive syntax has to be made in both `scripts/index.cjs` and
`vscode-vitu/lib/virtual.js`.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org) prefixes, for
example:

```
feat: add r-else-if directive
fix(vscode-vitu): map hover range inside r-slot
docs: describe key handling in r-for
```

### Pull requests

CI runs the plugin tests on Node 18, 20 and 22, builds the package, and runs
the extension tests. A PR needs a green CI run before it is merged.

## Releasing

Maintainers only.

1. Move the **Unreleased** entries in `CHANGELOG.md` under a new version
   heading and bump `version` in `package.json`.
2. Commit, then tag the commit `vX.Y.Z` and push the tag.
3. The `Release` workflow checks that the tag matches `package.json`, runs the
   tests, builds, and publishes to npm. It needs the `NPM_TOKEN` repository
   secret.
