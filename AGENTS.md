# AGENTS.md — Freetrack GPS Alerts Bot

Instructions for AI coding agents working in this repository. Human-oriented docs live in [README.md](./README.md).

## What This Is

A single-process Telegram bot (long polling, no web server) that monitors one GPS tracker via the Freetrack API (`https://gpsapi.freetrack.ua/api/`) and alerts password-authenticated subscribers when the device stops sending data or has weak GPS signal. State lives in PostgreSQL. Deployed on Railway (Nixpacks) or via Docker.

**All user-facing bot messages are in Ukrainian.** Keep them that way. Times shown to users are formatted in the `Europe/Kyiv` timezone via `formatDateTime()` in `src/index.ts`.

## Commands

```bash
npm ci                  # install deps (use ci, lockfile is authoritative)
npm run dev             # run from source (ts-node src/index.ts) — needs .env and a reachable Postgres
npm run build           # compile TypeScript to dist/
npm start               # run compiled dist/index.js
npm run migrate:up      # apply migrations (node-pg-migrate, config in .pgmigrate.json)
npm run migrate:down    # roll back last migration
npm run migrate:create  # scaffold a new migration in migrations/
```

**Verification (run after every change):** `npx tsc --noEmit` must pass with zero errors. There is no test suite and no linter configured — the compiler is the only automated gate, so don't weaken `strict` in tsconfig.

Don't run `npm run dev` to "test" changes unless you have real `TELEGRAM_TOKEN`/`FREETRACK_TOKEN` credentials — the bot starts polling Telegram immediately and fires an API check on startup.

## Layout

```
src/
  index.ts                          # ALL bot logic: command handlers, cron schedules, Freetrack fetch, alert rules
  config/database.ts                # pg Pool + query()/queryOne() helpers with connection-retry logic
  models/                           # plain TS interfaces mirroring DB rows (snake_case) + DTOs
  repositories/                     # raw parameterized SQL, one file per table
migrations/                         # node-pg-migrate CommonJS files (exports.up / exports.down)
.pgmigrate.json                     # node-pg-migrate config (reads DATABASE_URL)
Dockerfile + docker-entrypoint.sh   # entrypoint runs migrate:up, then npm start
railway.toml + nixpacks.toml        # Railway deployment (build → npm start)
```

There is no service/controller layering: `index.ts` orchestrates everything and repositories are the only DB access path. Keep new logic in that shape — handlers and cron jobs in `index.ts` (or a new top-level module if it grows), SQL only in `src/repositories/`.

**Known dead file:** `src/repositories/subscribersRepository.new.ts` is an unused near-copy of `subscribersRepository.ts` (nothing imports it). Don't edit it or take it as a pattern; deleting it is safe if cleanup is in scope.

## Database Rules

- **Raw SQL only** — no ORM. Always go through `query()` / `queryOne()` from `src/config/database.ts`; they add retry-on-connection-error handling (Railway Postgres restarts are expected and handled). Never call `pool.query` directly from repositories.
- **Always parameterize** (`$1, $2, ...`). Never interpolate values into SQL strings.
- Tables: `subscribers` (PK `chat_id` bigint), `alerts` (unique constraint `alerts_device_alert_unique` on `device_id, alert_type`), `device_history` (unique constraint `device_history_device_time_unique` on `device_id, last_update`).
- Upserts rely on those constraints (`ON CONFLICT ...`). If you change a constraint, update every `ON CONFLICT` clause that references it — grep for `ON CONFLICT` first.
- **Schema changes go through migrations**, never manual DDL. Create with `npm run migrate:create`, write CommonJS (`exports.up`/`exports.down`) matching the existing files, always implement `down`. Migrations run in a single transaction with order checking (`checkOrder: true`) — never rename or reorder existing migration files.
- Column names are `snake_case`; TS row interfaces in `src/models/` mirror them exactly. API-response shapes (e.g. `DeviceStatusResponse`) are `camelCase`. Keep that boundary.
- `decimal` columns (latitude/longitude) come back from `pg` as **strings** — convert with `Number()` at the repository boundary, as `getLastKnownLocation`/`getLatestDeviceStatus` do.
- Timestamps are `timestamp` without timezone; the Freetrack API returns UNIX seconds (`new Date(point.time * 1000)`).

## Domain Constants (change deliberately, keep README in sync)

| Rule | Value | Where |
|---|---|---|
| GPS check interval | every 7 min (`*/7 * * * *`) | `CHECK_INTERVAL` in `src/index.ts` |
| "No data" alert threshold | 15 minutes | `src/index.ts` (fetch + status logic) |
| Weak GPS threshold | < 10 satellites | `src/index.ts` |
| Alert cooldown per (device, type) | 30 min (`>= 0.5` h) | `shouldSendAlert` in `alertsRepository.ts` |
| History retention | 15 days, cleaned daily at midnight | `HISTORY_RETENTION_DAYS` in `src/index.ts` → `cleanupOldHistory` |
| Stale auth requests | deleted after 24 h, daily | `cleanupStaleRequests` |

Behavioral rule that is easy to break: **no "no data" alert when the vehicle is parked** — if the latest known `speed` is `0` or `null`, silence is considered normal (see `performCheck` and the `/status` handler). Preserve this when touching alert logic.

Alert types are plain strings: `'no_data'` and `'low_gps'`. Adding a new alert type = new string + `shouldSendAlert`/`recordAlert` calls; no schema change needed.

## Conventions

- TypeScript strict mode, CommonJS modules, target ES2020, 4-space indentation.
- Logging: use the `log()` / `logError()` helpers (UTC-timestamped) with bracketed tags — `[CHECK]`, `[FETCH]`, `[ALERT]`, `[CLEANUP]`, `[DB]`. Don't use bare `console.log` in bot code.
- Every Telegram handler wraps its body in `try/catch` and replies with a Ukrainian error message on failure — new handlers must do the same. A handler that throws unhandled will not crash the process but silently confuses users.
- Messages use `parse_mode: 'HTML'`. Only trusted, code-generated values are interpolated today; if you ever interpolate user- or API-provided free text, HTML-escape it.
- Telegram `polling_error` is logged and swallowed — expected during network blips; don't turn it into a crash.
- Secrets come from env vars only (`TELEGRAM_TOKEN`, `FREETRACK_TOKEN`, `DEVICE_ID`, `AUTH_PASSWORD`, `DATABASE_URL` or `DB_*`). Never hardcode or log them. Note: `FREETRACK_TOKEN` is intentionally embedded in the "Перевірити пристрій" links sent to authenticated subscribers — that is existing product behavior, not a leak to "fix" silently.
- The bot deletes the user's password message after submission (`bot.deleteMessage`) — keep that when touching the auth flow.

## Deployment Notes

- Railway: Nixpacks builds (`npm ci` → `npm run build`), starts with `npm start`, restarts on failure (max 10 retries). Migrations are run manually via `railway run npm run migrate:up` — a code change that requires a migration is not live until that is run.
- Docker: `docker-entrypoint.sh` runs `migrate:up` automatically before starting.
- `DATABASE_URL` connections use `ssl: false` (Railway internal networking). Local dev falls back to `DB_*` vars with localhost defaults.
- Node 20 (`.nvmrc`); `engines` allows >= 18.

## Checklist Before Declaring Done

1. `npx tsc --noEmit` — zero errors.
2. If SQL or schema changed: constraints referenced by `ON CONFLICT` still exist; migration has a working `down`.
3. If user-facing text changed: it is Ukrainian and any HTML tags are valid for Telegram's parser.
4. If domain constants changed: README.md updated to match.
5. No secrets in code, logs, or commits.
