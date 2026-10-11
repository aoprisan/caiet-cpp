# Caiet C++

A browser playground for a small C++ subset, aimed at Romanian 7th graders: `int` variables, `cin`/`cout`, `if`, `while`, `do…while`, `for`. The interface and all messages are in Romanian.

- Syntax highlighting, line-numbered editor
- Error messages in plain Romanian with the line highlighted
- Step-through execution with a visual stack of variables
- A plain-language explanation of the current line

Written in TypeScript, compiled with plain `tsc` (no bundler, no runtime dependencies). Needs Node 22+.

    npm ci          # once: installs the TypeScript compiler
    just serve      # builds, then serves http://localhost:8000
    just watch      # recompile on save (in a second terminal)
    just test       # typechecks and runs the tests

Without `just`: `npm run build`, `npm run serve`, `npm test`.

The page loads `dist/ui.js` as an ES module, so it must be served over HTTP; opening `index.html` from disk does not work.

## Deploying

`.github/workflows/pages.yml` runs the tests on every push and pull request, and on `main` builds and deploys `index.html`, `css/` and `dist/` to GitHub Pages. In the repository settings, set Pages → Source to "GitHub Actions".
