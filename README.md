# Caiet C++

A browser playground for a small C++ subset, aimed at Romanian 7th graders: `int` variables, `cin`/`cout`, `if`, `while`, `do…while`, `for`. The interface and all messages are in Romanian.

- Syntax highlighting, line-numbered editor
- Error messages in plain Romanian with the line highlighted
- Step-through execution with a visual stack of variables
- A plain-language explanation of the current line
- 273 practice problems from [pbinfo.ro](https://www.pbinfo.ro/) (class 9, language basics) with search and filters; a program can be checked on each problem's examples
- Installable as an app (PWA) and works offline after the first visit

Written in TypeScript, compiled with plain `tsc` (no bundler, no runtime dependencies). Needs Node 22+.

    npm ci          # once: installs the TypeScript compiler
    just serve      # builds, then serves http://localhost:8000
    just watch      # recompile on save (in a second terminal)
    just test       # typechecks and runs the tests

Without `just`: `npm run build`, `npm run serve`, `npm test`.

The page loads `dist/ui.js` as an ES module, so it must be served over HTTP; opening `index.html` from disk does not work.

## Deploying

`.github/workflows/pages.yml` runs the tests on every push and pull request, and on every push to `main` builds and deploys the site to GitHub Pages (https://aoprisan.github.io/caiet-cpp/). One-time setup: in the repository settings, set Pages → Source to "GitHub Actions".

The deployed site is `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `dist/`, `icons/` and `probleme/`. All paths are relative, so it works under the `/caiet-cpp/` subpath.

## PWA

- `manifest.webmanifest` — name, colours, icons (`icons/icon-192.png`, `icons/icon-512.png`, also used as maskable).
- `sw/sw.ts` → `sw.js` at the site root (so its scope covers the whole site). Network first with a cache fallback, so a new deploy shows up on the next load while online; Google Fonts are stale-while-revalidate.
- Icons are rendered from `icons/icon.svg`. Keep the artwork inside the central 80% circle so it survives maskable cropping.

## Problems

`probleme/probleme.json` is generated from a pbinfo export (a JSON file with a `probleme` array):

    node tools/probleme.mjs path/to/export.json

Problems whose examples need decimals, characters or numbers beyond `int` are hidden by default ("Doar cele care merg aici").
