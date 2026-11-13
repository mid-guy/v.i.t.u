# DEVLOG — development diary

Follows the entries in [CHANGELOG.md](CHANGELOG.md). Each entry records what
happened, **why it was wrong**, **how it was fixed**, and the **lesson**
learned.

---

## #1 — `r-for` transform: the output was text, not an expression (2026-07-16)

**What happened.** The first version of `handleRFor()` in `scripts/index.cjs`
called `path.replaceWith(mapCall)` and trusted Babel to handle the rest. It
compiled to `<ul>items.map(...)</ul>`: the whole `.map` expression became a
**text node** sitting in the JSX.

**Why it was wrong.** Babel does not wrap an expression in a
`JSXExpressionContainer` when the parent node is a JSX element. `replaceWith`
does exactly what it says: it swaps one node for another, and whether the
result is valid is up to you.

**How it was fixed.** Check `path.parentPath`: if it is a
`JSXElement`/`JSXFragment`, wrap `mapCall` in `t.jSXExpressionContainer(...)`
before replacing.

**Lesson.** Don't stop at an AST output that "looks right"; render it for
real. The deciding test runs `renderToStaticMarkup` through react-dom/server
and compares the HTML, and that is what caught this bug immediately.

---

## #2 — Existing `r-else` bug: the attribute was removed from the wrong element (2026-07-16)

**What happened.** While verifying `r-for` with a real render, React warned:
`Received `true` for a non-boolean attribute `r-else``. The bug predates
`r-for` and has nothing to do with it, but it only showed up in an end-to-end
render.

**Why it was wrong.** `_removeAttr(attr)` was hard-coded to operate on
`this.node` (the element carrying `r-if`), while the `r-else` attribute to
remove lives on a **sibling element**. The filter ran quietly and threw
nothing; it just removed nothing, and `r-else` went straight to the DOM.

**How it was fixed.** Added a target parameter:
`_removeAttr(attr, node = this.node)`, and the else branch passes
`elsePath.node`.

**Lesson.** A helper that defaults to operating on `this` is a trap when
handling several nodes at once. And React warnings are real signals, not
noise: a render that "looks right" with a dirty console still has a bug.

---

## #3 — Settling on a single format, `(item, index) in items` (2026-07-17)

**What happened.** At first both `item in items` and `(item, index) in items`
were supported (index optional, with `_index` generated when missing). Later
the bare form was dropped and only the parenthesized form kept.

**Why it changed.** Two syntaxes meant two regex branches, two code-generation
branches (a `_index` uid versus a real identifier) and two sets of tests, in
**both places** (the Babel plugin and the VSCode extension), which had to
match exactly. Every new feature had to be written twice. A single mandatory
format makes the regex simpler, leaves one error message, and removes any
chance of the plugin and the extension disagreeing on syntax.

**Lesson.** In a home-made DSL, "supporting several ways to write it" is debt,
not convenience. When the same syntax is parsed at several layers (compiler
and editor tooling), keep the number of variants as small as possible.

---

## #4 — Extension v1: hover in the element body shows `any` (2026-07-17)

**What happened.** Virtual document v1 only rewrote the **attribute**:
`r-for="(item, index) in items"` → `r-for={[...(items)].map((item, index) => item)}`.
Hover inside the string worked, but hovering `{item.message}` in the
**element body** showed `any`.

**Why it was wrong.** To TypeScript, `item` in the element body was still an
unknown variable: the binding lived only inside the rewritten attribute and
did not reach the children. The virtual document only made the string
"parseable"; it did not reproduce the **runtime semantics** (Babel wraps the
whole element in the `.map` callback).

**How it was fixed.** Rewrote `lib/virtual.js` to use TypeScript's own parser
(`ts.createSourceFile`) to find elements carrying directives (a regex cannot
find element boundaries: nested tags, self-closing tags), then wrap the
**whole element**: `{[...(items)].map((item, index) => <li>...children...</li>)}`.
Added `scopes` (the range of an element with r-for) so the extension only
answers inside them and leaves everything else to the built-in TS server.

**Lesson.** A virtual document must reproduce **what the code is at
runtime**, not a version that is "just enough to stop parse errors". When you
need real syntactic boundaries (where an element starts and ends), use a real
parser; a regex is only good for flat tokens.

---

## #5 — Hover shows `any` even though the mapping is right: React types missing (2026-07-17)

**What happened.** The example switched to `const [items] = useState(...)`,
and hovering `item` immediately showed `any`, even though the virtual
document was generated correctly.

**Why it was wrong.** Not a logic bug: the extension's language service could
not resolve the `'react'` module (`vscode-vitu` did not have
`react`/`@types/react` installed), so `useState` was `any` and the whole
inference chain collapsed to `any`. An array literal (`const users = [...]`)
was fine because its type comes straight from the value.

**How it was fixed.** `pnpm add -D react @types/react` in `vscode-vitu`. Real
user projects don't need this: `react` is always in their `node_modules`.

**Lesson.** When the language service returns `any`, the first suspect is
**broken module resolution**, not a wrong mapping. Check that imports resolve
before debugging your own logic.

---

## #6 — An extra `any` line in the tooltip: hovers merged from several providers (2026-07-17)

**What happened.** After #4, hovering `item.message` showed the correct
`(property) message: string`… plus a stray `any` line underneath.

**Why it was wrong.** VSCode's tooltip **merges the results of every hover
provider**. The correct line came from the extension; the `any` line came from
the built-in TS server, which sees the original file where `item` does not
exist, and quick info for an unresolved identifier is `any`. The extension
API has no way to remove another provider's results.

**How it was fixed.** Did what Volar (Vue) does: wrote
`typescript-vitu-plugin`, loaded into the built-in tsserver through
`contributes.typescriptServerPlugins`. The plugin proxies the language service
and only touches two functions: it blocks quick info on identifiers that
**resolve to no symbol** inside an element with r-for, and filters
`Cannot find name` diagnostics (2304/2552) in the same range, which matters
for `.tsx`, where the built-in server really type-checks. Outside r-for
elements everything passes through untouched; `tsc`/CI are unaffected because
the plugin only lives in the editor.

**Lesson.** A limit of the extension API is not a dead end: the right layer
for changing built-in TS behavior is a tsserver plugin, the official channel
Volar also uses. The blocking condition must be as narrow as possible
(unresolved symbol and inside the scope) so real information isn't swallowed.

---

## #7 — `user.name` in the body is plain white: the semantic highlighter is blind (2026-07-17)

**What happened.** Code in the body of an r-for element had no color:
`user.name` was plain white, while the same code written with a manual
`.map()` was fully colored.

**Why it was wrong.** The built-in TS server only emits semantic tokens for
identifiers it can resolve. To it, `user`/`index` are unknown variables, so
they get no token and fall back to the default TextMate color.

**How it was fixed.** The extension already had classifications from the
virtual document (where `user` is a real parameter) but only used them inside
the directive string. Extended this: classify **the whole virtual file**, map
each span back to the source, and apply decorations to tokens inside
`scopes`. The colors reused the default Dark+/Light+ semantic palette (light
blue for variables/properties, yellow for functions, teal for types).

**Lesson.** Highlighting a DSL should make the code look **like ordinary
code**, not stand out more (see Tonsky's post on syntax highlighting): reuse
the theme's colors instead of inventing a palette. The only accent worth
keeping was underlining the directive content and coloring the `in`/`of`/`from`
keyword to mark "this is DSL". (Replaced in #14: decorations and underline
were removed and coloring moved to a TextMate grammar.)

---

> Entries #8–#11 are about scoped slots, a feature removed in #13. They are
> kept because the lessons still apply.

## #8 — Scoped slots: where does `<slot>` get `children` from (2026-07-19)

**What happened.** Added a pair of scoped-slot directives: `<slot item={row} />`
inside a component pushes data out, and `r-slot="{ item }"` at the call site
receives it. The first transform found `children` with
`path.getFunctionParent()`, and it broke as soon as the outlet sat inside an
`r-for`.

**Why it was wrong.** After `handleRFor()` runs, the element is already
wrapped in `.map((row, i) => ...)`. The nearest function parent of `<slot>` is
no longer the component but **the `.map` callback**, whose params are the loop
bindings, so `children` became `row.children`. The same happens with a
hand-written `.map()`.

**How it was fixed.** `_childrenRef()` keeps climbing while the parent function
is **an argument of a CallExpression** (the mark of a callback), and only stops
at the real component. If the component does not destructure `children`, the
binding is inserted into its params, so the author declares nothing.

**Lesson.** In a visitor that runs several directives on the same element,
transform order is part of the semantics: `getFunctionParent()` answers for
**the AST after it has been modified**, not the AST the author wrote. To find
"the component" you must be able to say how a component differs from a
callback.

---

## #9 — Typing slots without making authors declare `children` (2026-07-19)

**What happened.** Slots worked at runtime, but in the editor `item` from
`r-slot="{ item }"` was `any`. Getting a type would normally mean making the
author write a type for `children`, which is exactly what both Vue and this
directive try to avoid.

**Why it was hard.** A slot's type lives **somewhere else, in another file**,
from where it is consumed: it comes from the attributes on `<slot>` inside the
component (possibly inside one or more nested `r-for`s), while it is needed in
the body of the `r-slot` element at the call site. There is no ready-made
channel for a type to travel from one to the other.

**How it was fixed.** Let the type ride on **the component's return type**. In
the virtual document, each outlet generates a const that captures the type,
**replaying the surrounding `r-for` chain** so the expressions see the loop
bindings
(`const __vituS0 = [...(data)].map((entry, i) => ({ item: (entry), index: (i) }))[0]`).
Every `return` of the component is wrapped in `__vituCapture(jsx, __vituS0)`,
declared as `J & { __vituSlots: S }`. At the call site, children become a
render function whose parameter is `__VituSlots<typeof List>`: `.tsx`
annotates it directly, `.jsx` uses a JSDoc `@type`. Both helpers live in a
virtual `.d.ts` injected by `lib/service.js`.

**Lesson.** To make a type cross a module boundary, attach it to something
TypeScript already carries across that boundary, here the return type. The
only remaining requirement is that the component's props are typed (JSDoc or
TS), the same role `defineProps` plays in Vue.

---

## #10 — Slots through `import`: virtualizing files that are not open (2026-07-19)

**What happened.** #9 worked when the component and the call site were in
**the same file**. Moving `List` into `./Slots` and importing it turned `item`
back into `any`.

**Why it was wrong.** The language service only overrides the content of
**the open file**; imported files are read straight from disk. On disk, `List`
still has `<slot>` and `r-for`, syntax TS does not understand, and no
`__vituCapture` to carry the type out. Its return type was useless.

**How it was fixed.** `getScriptSnapshot` runs `buildVirtual` **when reading a
file**, for every source file that looks like it has directives
(`SCRIPT_EXT_RE` + `DIRECTIVE_HINT_RE`), falling back to the original content
on error. Two filters keep it cheap: script files only, and only when the
content matches the regex, so ordinary files pay nothing.

**Lesson.** A "virtual document" is not just about the open buffer. Whenever a
type has to cross an `import`, **every file along the way** must be the virtual
version; otherwise the module boundary is where the type dies.

---

## #11 — Cleaning up slot noise: wrong place, wrong error, duplicate error (2026-07-19)

**What happened.** Once slot types were right, three kinds of false red
squiggles showed up: TS complained that attributes on `<slot>` were unknown
props of `HTMLSlotElement`; elements with `r-slot` got prop-mismatch errors;
and a real error inside `r-slot` showed up **twice**.

**Why it was wrong.** Three different causes that couldn't be merged. To the
built-in TS server, `<slot>` is a built-in web-component tag. The children of
an `r-slot` element are only a render function **after the transform**; before
that they are ordinary JSX, so they don't match the props. And the duplicate
came from #9 itself: the capture replays the `r-for` chain, so a bad
expression has **two generated copies** mapping to one source span.

**How it was fixed.** In `typescript-vitu-plugin`: mute every attribute of
`<slot>`, and filter the prop error codes (2322/2339/2559/2739/2740/2769)
**only within the opening tag** of an element with `r-slot`. In the extension:
dedupe diagnostics by a `start:end:code` key after mapping to the source.

**Lesson.** Generated code with copies produces diagnostics with copies:
deduping is a required part of the mapping pipeline, not polish. And every
time you suppress a built-in TS error, the scope must be narrow enough to
describe in one sentence ("prop error, in the opening tag, of an element with
r-slot"); anything wider starts swallowing real errors.

---

## #12 — `r-if`/`r-else`: the first tests turned up two bugs (2026-10-05)

**What happened.** Writing tests for the plugin (`scripts/_tests_/`), two
`r-if` cases produced the wrong output:

- `<div><p r-if={ok}>yes</p></div>` produced `<div>ok ? <p>yes</p> : null</div>`,
  exactly the bug from #1, but in `handleRIf()`.
- `<p r-if={a}/><p r-if={b}/><p r-else/>` produced `a ? … : <else>`, and the
  `r-if={b}` element **disappeared**.

**Why it was wrong.** (1) #1 only added the `JSXExpressionContainer` wrapping
for `r-for`; `r-if` still did a bare `replaceWith(conditionalExpression)`. Run
in the same pass as `preset-react` it still rendered correctly, so nobody
noticed. (2) `handleRIf()` found `r-else` with `siblings.find(...)`, meaning
the **first `r-else` anywhere after it**, then deleted every sibling in
between.

**How it was fixed.** Moved the container wrapping into a shared `_asChild()`
used by `r-for`, `r-if` and `<slot>`. `r-else` only pairs with the element
**right after** `r-if` (skipping whitespace-only text); otherwise the other
branch is `null`.

**Lesson.** Fixing a bug in one handler leaves the same bug in the handler
next to it; fix it in the shared helper. And "renders correctly" is not
enough: the printed output must also be valid JSX, because the plugin may run
in a different pass from the JSX transform.

---

## #13 — Dropping slots, finishing error checking in the editor (2026-11-13)

**What happened.** Scoped slots (#8–#11) brought the most complex part of the
extension (capturing types through return types, virtualizing imported files,
three kinds of noise filtering), while the four core directives still had
gaps: `r-if="ok"` crashed the plugin with a `TypeError`, an orphan `r-else`
leaked into the DOM, the editor said nothing about malformed `r-for`, and
`<p r-if={user}>{user.name}</p>` in `.tsx` got "possibly undefined" from the
built-in TS server even though the runtime condition guards it.

**Why it was wrong.** Three causes:

- The Babel plugin assumed attributes were always well-formed
  (`rIfAttr.value.expression`).
- The extension only reproduced the `r-for` transform; `r-if` was still an
  attribute in the virtual document, so TypeScript did not narrow types in the
  element body, breaking convention #3 (virtual document = runtime semantics).
- The grammar was copied in three places (Babel, `lib/virtual.js`, the
  tsserver plugin) and they had drifted: the editor accepted `v-for`,
  `r-show="string"` and any iterable (`[...(expr)]`), while Babel did not, so
  the editor stayed silent and the code blew up at runtime.

**How it was fixed.**

- Removed slots entirely from the Babel plugin, the extension, the tsserver
  plugin, the tests and the docs.
- The Babel plugin throws `buildCodeFrameError` for every misuse (table in the
  README). An `r-else` still on an element when the visitor reaches it means
  no `r-if` claimed it, since `handleRIf()` has already removed the ones it
  paired.
- `typescript-vitu-plugin/collect.js`: **one** directive reader built on the
  TypeScript parser, shared by the extension and the tsserver plugin, which
  also returns `problems` with the same wording as Babel.
- The virtual document reproduces the rest:
  `{(__vituBool((cond)), (cond)) ? <A/> : <B/>}` for `r-if`/`r-else` (the
  condition is generated twice, one copy for narrowing and one to enforce a
  boolean; the comma operator keeps narrowing), `__vituFor(expr).map(...)`
  accepting arrays only, and `{...__vituBool((cond))}` for `r-show`.
- The language service reads the project's `tsconfig.json`/`jsconfig.json`;
  otherwise the user's `strict` would have no effect inside directives.
- tsserver plugin: inside rewritten elements it defers entirely to the
  extension (diagnostics and hover), because the built-in server cannot
  narrow; elsewhere it filters "declared but never read" for variables only
  read inside an `r-for` string.

**Lesson.** "Editor error checking" is only trustworthy when it rejects exactly
what the compiler rejects, so the grammar must have a single source, and the
virtual document must be a complete translation rather than stopping at the
hardest directive. Dropping a big feature (slots) is much cheaper than keeping
it while the core is unfinished.

---

## #14 — Directives looked like underlined strings: moving to TextMate like Volar (2026-11-13)

**What happened.** Looking at a real file in the user's theme: every `r-for`
string was underlined, `(item, index)` was one color and `in` another, both
unlike the rest of the theme; `r-if`/`r-for` blended in with ordinary
attributes. Error messages talked about code the user never wrote: "Argument
of type 'string' is not assignable to parameter of type 'boolean | undefined'".
`r-for` over a `Set` also dragged in "Type 'unknown' is not assignable to type
'ReactNode'" in the body.

**Why it was wrong.**

- Coloring was done with decorations using hard-coded Dark+ colors (#7): it
  ignored the theme, only colored tokens with semantic info, and the underline
  meant to "mark the DSL" looked like a link or an error.
- Error messages were TypeScript's verbatim text when it rejected the argument
  of `__vituBool` / `__vituFor`, two functions that exist only in the virtual
  document.
- `__vituFor<T>(source: readonly T[])`: when inference failed, `T = unknown`,
  so every use of `item` in the body errored as well.

**How it was fixed.**

- `syntaxes/vitu-directives.tmLanguage.json`: a grammar injected into JSX
  attributes, the way Volar does it for `v-for`/`v-if`. `r-for` gets the
  `keyword.control.loop` scope and `r-if`/`r-else` get
  `keyword.control.conditional`; the quotes keep the string color and the
  inside is code: `item`/`index` are `variable.parameter`, `in|of|from` are
  keywords, and the source is colored as an expression. Colors come from the
  theme; the extension contains no color values any more. All decorations were
  removed.
- The `r-for` string is matched by **one** regex and colored inside through
  `captures`; with begin/end, a stray quote inside the expression would let
  the coloring run past the attribute. Inside a capture, `include` (local,
  `$base`, or another grammar that isn't loaded) does not work reliably, so
  the expression is colored with a few self-contained patterns (identifiers,
  calls, properties, strings, numbers).
- `lib/diagnostics.js`: one diagnostic collector shared by the extension and
  the tests. When a helper rejects **the whole** expression, the message is
  rewritten in directive terms: "r-if expects a boolean, got 'string'…",
  "r-for expects an array, got 'Set<number>'…". Errors inside the expression
  keep TypeScript's wording. TS errors carry `source: 'ts'` and the error code
  like any other TS error; "never read" is faded (`Unnecessary` tag).
- `__vituFor<S extends readonly any[]>(source: S): S[number][]`: when the
  source is wrong, `S` falls back to its `any[]` constraint, so the element
  body gets no follow-up errors.

**Lesson.** DSL highlighting belongs in a grammar, not in decorations: a
grammar lets the theme choose the colors, while decorations have to guess. And
error messages are UI: nothing generated in the virtual document should leak
into the wording.

---

## Project conventions

1. **Verify with a real render**, not just by comparing generated code (#1, #2).
2. **One syntax, several parse layers**: the Babel plugin and the extension
   must share one grammar and the same error messages; keep the grammar as
   small as possible, with a single reader on the editor side (`collect.js`)
   (#3, #13).
3. **Virtual document = runtime semantics**: reproduce the real transform (#4).
4. Unexpected `any` → check **module resolution first, logic second** (#5).
5. To change built-in TS behavior, use a **tsserver plugin**, and intervene as
   narrowly as possible (#6).
6. Transform order is semantics: a helper looking for a parent node must be
   right for the AST **after** the other directives have run (#8).
7. To carry a type across an `import`, attach it to the **return type** and
   virtualize every file along the way, not just the open one (#9, #10).
8. Generated code with copies → **dedupe diagnostics** by source span; when
   suppressing built-in TS errors, the scope must be narrow enough to describe
   in one sentence (#11).
9. **Use pnpm** for every install in this repo.
10. Every directive has output tests in `scripts/_tests_/`; a bug fix adds a
    test that fails before and passes after (#12).
11. `dist/` is not committed; it is built at publish time (`pnpm build`).
