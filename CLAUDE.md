# CLAUDE.md

All project instructions live in AGENTS.md (single source of truth for every coding agent). Follow it exactly:

@AGENTS.md

## Claude Code specifics

- After every file modification run `npx tsc --noEmit` and fix all errors before reporting success. There is no linter or test suite in this repo — the compiler is the only gate.
- Project permission allowlist is in `.claude/settings.json` (npm/npx/node/git and TypeScript checks are pre-approved).
- `npm run dev` starts live Telegram polling and hits the Freetrack API — do not run it as a smoke test unless explicitly asked.
