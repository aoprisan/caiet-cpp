# Caiet C++ — TypeScript compiled with tsc, no bundler.

default:
    @just --list

# Install the TypeScript compiler (once)
install:
    npm ci

# Compile src/*.ts to dist/ and sw/sw.ts to sw.js
build:
    npm run build

# Recompile on every save
watch:
    npm run watch

# Build, then serve locally at http://localhost:8000
serve port="8000": build
    python3 -m http.server {{port}}

# Run interpreter + explainer tests
test:
    npm test
