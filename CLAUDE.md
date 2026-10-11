# Caiet C++

Static web page: a C++-subset interpreter for Romanian 7th graders. TypeScript compiled by plain `tsc` to ES modules — no bundler, no framework, no runtime npm packages (the only devDependencies are `typescript` and `@types/node`). Keep it that way unless asked.

## Commands

- `npm run build` / `just build` — `src/*.ts` → `dist/`, `sw/sw.ts` → `sw.js` (both gitignored)
- `just serve` — build, then serve on :8000 (ES modules need HTTP, not `file://`)
- `just watch` — `tsc --watch`
- `npm test` / `just test` — compiles `tests/` with `tests/tsconfig.json` into `build-test/` and runs `tests/run.ts` (plain `node:assert`, no test framework)
- `npm run typecheck` — both projects, no emit

Run `npm test` after any change to `src/interp.ts` or `src/explain.ts`, and add a case for every new language feature or error message.

## Layout

- `index.html` — markup only; loads `dist/ui.js` as `type="module"`
- `css/style.css` — all styles; colours are tokens on `:root` with a dark set under `prefers-color-scheme` and `[data-theme]`
- `src/interp.ts` — `compile(src).run(input)`, `CppError`, trace types; no DOM access
- `src/explain.ts` — `explain(line)` returns Romanian sentences for one source line; no DOM access
- `src/ui.ts` — editor, highlighting overlay, run button, stepper/stack, examples, localStorage draft
- `tests/run.ts` — tests for the two DOM-free modules
- `sw/sw.ts` — service worker, compiled as a classic script (no imports/exports) with the WebWorker lib by `sw/tsconfig.json`, emitted to the repo root so its scope is the whole site. Its `SHELL` list must name every file the page needs offline; bump `CACHE` if you remove files from it
- `manifest.webmanifest`, `icons/` — PWA manifest and icons (PNG rendered from `icons/icon.svg`)
- `tsconfig.json` — app build (DOM lib, no Node types); `tests/tsconfig.json` extends it with Node types
- `.github/workflows/pages.yml` — typecheck + test on push/PR; deploy to GitHub Pages from `main`. Its "Assemble site" step lists every published file; add new top-level files there too

Imports use `.js` extensions (`NodeNext` resolution) so the emitted files run unchanged in the browser and in Node. `interp.ts` and `explain.ts` must stay free of DOM and Node APIs.

## Interpreter design

- `lex()` produces tokens `{t, v, line, n?}` (`n` is the value of a `num` token); `#` lines are skipped but `#include <iostream>` is remembered.
- `compile()` is a recursive-descent parser that emits closures directly (no AST). Variables are resolved at compile time to slots in a flat `mem` array; `undefined` means "declared, no value yet". An `Expr` closure that is a bare variable carries `slot`, so it can be assigned to.
- Statement closures return a `Flow`: 0 (normal), 1 (break), 2 (continue), 3 (return).
- `tick(line)` runs at each statement/loop turn: enforces the 20M step limit and pushes a `Snapshot` `{line, vars, out}` to `trace` (first 2000 steps). The UI replays `trace` for the stepper; `live` tracks which slots are currently in scope.
- Errors are `CppError(msg, line, kind)`, `kind` being `'compile'` or `'run'`. On a runtime error `run()` attaches `out`, `trace`, `end` and `cut` before rethrowing.

## Language rules (deliberate)

- Only `int` (32-bit wrap). No arrays, functions, floats, chars, strings. Unsupported things must fail with a friendly Romanian message, never a generic parse error.
- `#include <iostream>`, `using namespace std;` and `int main()` are required, so programs also compile in a real compiler.
- Reading an uninitialised variable is a runtime error (stricter than real C++, on purpose).
- `cin` past the end of input is a runtime error.

## Conventions

- All user-facing text is Romanian, with proper diacritics (ș, ț with comma below) and „ghilimele” quotes. Wording targets a 13-year-old: short sentences, no jargon.
- The highlight overlay depends on the textarea and `#hl` sharing font, 16px/24px line metrics and 12px padding. Change them together (also the `24` and `12` constants in `src/ui.ts`).
- The page must work at phone width and in both light and dark themes.
- All URLs stay relative (the site is served from `/caiet-cpp/` on GitHub Pages).
