# vitu-language-features

A VSCode extension that type-checks and reports errors for V.I.T.U directives
(`r-if`, `r-else`, `r-show`, `r-for`) as you type, in JSX and TSX.

```jsx
<li r-for="(item, index) in items" r-if={item.done}>{item.title}</li>
```

Out of the box, VSCode treats `"(item, index) in items"` as a string,
`item`/`index` in the element body as undefined variables, and `r-if` as an
unknown attribute. This extension uses the same technique as Volar (Vue): it
generates a **virtual document**, a copy of the file in which every directive
is rewritten into exactly the code the Babel plugin compiles it to:

```jsx
{__vituFor(items).map((item, index) =>
	(__vituBool((item.done)), (item.done)) ? <li>{item.title}</li> : null)}
```

It then runs the TypeScript LanguageService on the virtual document and maps
the results back to the original positions, both inside the directive and in
the element body.

## Errors

| You write | Red squiggle |
| --- | --- |
| `r-for="(u, i) in userz"` | `Cannot find name 'userz'` right inside the string |
| `r-for="(s, i) in new Set()"` | `r-for expects an array, got 'Set<…>'` (the runtime calls `.map`) |
| `r-for="user in users"`, `r-for={users}` | malformed `r-for` |
| `{user.nam}` in an `r-for` body | `Property 'nam' does not exist` |
| `r-if={title}`, `r-show={title}` | `r-if expects a boolean, got 'string'` |
| `r-if="ok"`, `r-show` with no value | missing `{expression}` |
| `r-else` not directly after `r-if` | `r-else must directly follow…` |
| `r-else={x}`, `r-else` on the same element as `r-if` | misused `r-else` |

Directive misuse errors use the same wording as the Babel plugin's compile
errors.

`r-if` / `r-else` are checked as the conditional expression they compile to,
so types are **narrowed** in the element body:

```tsx
<p r-if={user !== undefined}>{user.name}</p>   {/* user: User */}
<p r-else>Not signed in</p>
```

The extension uses the `compilerOptions` from the workspace's `tsconfig.json` /
`jsconfig.json` (`strict`, `paths`, …). `.jsx` files are always checked inside
directives, unless the config sets `checkJs: false`. After changing the
config, run **Developer: Reload Window**.

## IntelliSense

- **Completion** in `r-for` expressions and in the element body (`item.` lists
  the properties): type `.` or press Ctrl+Space
- **Hover**: `item`/`index` show the array element type; variables narrowed
  by `r-if` show the narrowed type
- **Go to definition** from inside the string or element body to the original
  variable
- **Syntax colors** from your theme, like Volar for `v-for`/`v-if`: `r-for`,
  `r-if` and `r-else` are colored as keywords; the content of an `r-for`
  string is colored as code (`item`/`index` as parameters, `in`/`of`/`from`
  as keywords) instead of as a string

## Try it

```bash
pnpm install
pnpm test          # core tests (node:test), no VSCode needed
```

Open the `vscode-vitu` folder in VSCode and press **F5**. The Extension
Development Host opens `example/App.jsx` to play with (`example/App.tsx` has a
type-narrowing example with `r-if`).

## Debugging

You can open either the `vscode-vitu` folder or the repo root; both have a
`.vscode/launch.json`. The **Run and Debug** panel has two configurations:

- **Run Extension** (at the repo root: **Run Extension (vscode-vitu)**) opens
  the Extension Development Host with `example/App.jsx`; breakpoints in
  `extension.js` or `lib/` are hit.
- **Debug Tests** (at the repo root: **Run Tests (vscode-vitu)**) runs
  `test/diagnostics.test.js` under the VSCode debugger; change `program` in
  `launch.json` to debug another test file.

To debug tests from the terminal, without VSCode:

```bash
pnpm test:debug    # node --inspect-brk, pauses on the first line until a debugger attaches
```

Then open `chrome://inspect` in Chrome, or use VSCode's
**Debug: Attach to Node Process** command.

## Architecture

- `typescript-vitu-plugin/collect.js`: the only directive reader on the editor
  side. It uses the TypeScript parser to find elements carrying directives,
  pairs `r-else` with `r-if`, and returns `problems` for every misuse. Its
  grammar must match the Babel plugin (`scripts/index.cjs`)
- `lib/virtual.js`: builds the virtual document from that result, plus a
  two-way offset mapping (segments for directive expressions, ident chunks for
  verbatim copies, scopes for rewritten elements)
- `lib/diagnostics.js`: collects diagnostics in source coordinates, shared by
  the extension and the tests, and rewrites errors on the `__vitu*` helpers in
  directive terms
- `lib/service.js`: a `ts.createLanguageService` that reads the real
  filesystem, except for the open file, which is overridden with its virtual
  content; plus a virtual `.d.ts` declaring `__vituFor` / `__vituBool`
- `syntaxes/vitu-directives.tmLanguage.json`: TextMate injection grammar that
  colors the directives
- `extension.js`: registers the completion/hover/definition providers and the
  diagnostics, answering only inside directives and rewritten elements
  (everything else is left to the built-in TS server)
- `typescript-vitu-plugin/index.js`: a plugin loaded into VSCode's built-in
  tsserver (`contributes.typescriptServerPlugins`). The built-in server sees
  the original file and so answers wrongly inside elements with directives;
  the plugin turns off its diagnostics and hover exactly there, and drops the
  "declared but never read" warning for variables only used inside an `r-for`
  string

## Limitations

- One workspace uses one set of `compilerOptions` (looked up from the root);
  monorepos with several tsconfigs are not split yet.
- `r-if` on an element with `r-for` does not take an `r-else` (the condition
  runs per item, inside the loop).
- The expression inside an `r-for` string is colored by a small set of rules
  (identifiers, calls, properties, strings, numbers); rare syntax may show
  plain, and a multi-line `r-for` value is not colored.
