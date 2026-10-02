# Contributing

Thanks for helping. The easiest high-value contributions are **adapters** (support
for another agent's logs) and **false-positive reports** (a finding that was wrong).

## Setup

```bash
git clone https://github.com/Nithinfgs/unstuck && cd unstuck
npm install
npm run check      # eslint + tsc + tests
npm run demo       # see it work on bundled sample sessions
```

Node 20 or newer. The runtime has zero dependencies; keep it that way. Dev
dependencies are only lint and type checking.

## Layout

```
src/adapters/   one file per log format → normalized Session
src/detect/     one file per detector → Finding[]
src/aggregate.js  cross-session patterns (learned fixes, repeated corrections)
src/render/     terminal, html, json, suggest
tests/          node:test, no framework
```

## Adding a detector

1. Create `src/detect/<name>.js` exporting `detectX(session, opts)` that returns
   `Finding[]` (use `makeFinding`).
2. Register it in `src/detect/index.js`.
3. Add a label in `src/render/terminal.js` and `src/render/html.js`.
4. Add tests for **both** "fires when it should" and "stays quiet on normal work".
   Precision matters more than recall: a noisy detector gets ignored.

## Adding an adapter

See [docs/adapters.md](docs/adapters.md). Please include a small anonymized fixture
and never commit real transcripts.

## Pull requests

- Keep PRs focused; one detector or adapter per PR.
- Run `npm run check` before pushing; CI runs it on Linux, macOS and Windows.
- Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Regenerate the demo assets if output changes: `npm run build:demo && npm run build:assets`.
