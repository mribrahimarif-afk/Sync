# Sync

Sync is a club and membership management application for gyms, yoga studios, martial-arts academies, training centers, swimming clubs and mixed facilities. The initial market is Pakistan (default currency PKR, default timezone `Asia/Karachi`, English staff interface, architecture ready for Urdu content later).

## Status: foundation only

This repository currently contains the **engineering foundation** (TASK-001): a runnable skeleton of a web app, an API, a background-worker process and one shared contract package, with tests and CI. **No product feature exists yet**: no sign-in, database, members, billing, attendance or jobs. The web page only reports whether the API process answers, and says plainly that this does not mean the product is operational.

- [Architecture](docs/architecture.md) - stack, module boundaries, and what is implemented vs. planned.
- [Delivery](docs/delivery.md) - scope, holds, approved business rules, and the task/PR workflow.

## Layout

| Path                 | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `apps/web`           | Next.js + React staff web app (port 3000)                        |
| `apps/api`           | Fastify HTTP API (port 4000)                                     |
| `apps/worker`        | Separate background-worker process (skeleton, no job processing) |
| `packages/contracts` | Framework-independent types and guards shared by the API and web |
| `docs`               | Architecture and delivery documents                              |
| `scripts`            | Combined dev runner and process smoke test                       |

## Prerequisites

- **Node.js 24.20.x** (Active LTS line; exact version in [`.nvmrc`](.nvmrc), enforced by `engines` and `engine-strict`).
- **npm 11.19.x** (the version bundled with this Node; recorded in `packageManager`).

No Docker, PostgreSQL or Redis is needed at this stage.

## Install and configure

```bash
npm ci                      # installs exactly what package-lock.json records
```

Configuration is optional for local development - defaults work. To override, copy the examples (each documents its variables, and which are required in production):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local
```

Only safe example values are committed; real `.env*` files are git-ignored. Invalid or missing required configuration makes the API and worker exit with code 1 and a message naming each offending variable.

## Run in development

| Command              | Starts                                               |
| -------------------- | ---------------------------------------------------- |
| `npm run dev:web`    | Web on http://localhost:3000                         |
| `npm run dev:api`    | API on http://127.0.0.1:4000                         |
| `npm run dev:worker` | Worker (logs that job processing is not implemented) |
| `npm run dev`        | All three, with prefixed logs                        |

`npm run dev` stops everything together on Ctrl+C, SIGTERM, or when any service dies, killing each service's whole process tree (including on Windows) so no orphan keeps a port bound.

The shared contracts are consumed from their compiled output, so every root command builds `@sync/contracts` first. If you edit `packages/contracts`, run `npm run build:contracts` (and restart the dev servers).

Open http://localhost:3000 with the API running to see the connectivity check; stop the API and press **Retry** to see the unavailable state.

## Validate

Run these from the repository root (CI runs the same commands):

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit in every workspace (strict)
npm test               # Vitest in every workspace
npm run build          # production builds of contracts, API, worker, web
npm run smoke          # starts the compiled API and worker, checks health, config failure, termination
npm run validate       # all of the above, in order
```

`npm run format` rewrites files to the Prettier style.

Process smoke test details (`scripts/smoke.mjs`, needs `npm run build` first): it starts `apps/api/dist/main.js` on a free port and checks `/api/health` against the shared contract; starts the worker and checks its "not implemented" message; confirms that invalid configuration exits non-zero with an actionable message; and stops each process. Windows cannot deliver SIGTERM to Node, so the "exits with code 0 on SIGTERM" and "shutdown complete" assertions run on Linux/macOS only (CI); the shutdown logic itself is unit-tested everywhere.

## Production build and start

```bash
npm run build
NODE_ENV=production CORS_ALLOWED_ORIGINS=https://app.example.com npm run start:api
NODE_ENV=production npm run start:worker
NEXT_PUBLIC_API_BASE_URL=https://api.example.com npm run build   # web reads this at BUILD time
npm run start:web
```

Compiled `start:*` commands do **not** read `.env` files; provide real environment variables (or use `node --env-file=.env dist/main.js` inside the app folder). In production the API requires `CORS_ALLOWED_ORIGINS`, refuses wildcards, and ignores `X-Forwarded-For` unless `TRUSTED_PROXIES` lists your reverse proxy. Deployment itself is out of scope for this task.

Default ports: web 3000, API 4000 (`PORT`), worker none.

## Troubleshooting

- **`npm ci` fails with `EBADENGINE`** - wrong Node/npm. Install Node 24.20.x (`nvm use` reads `.nvmrc`).
- **`Cannot find module '@sync/contracts'` or missing types** - contracts are not built yet. Run `npm run build:contracts` (root scripts do this automatically).
- **API exits immediately with "Invalid API configuration"** - read the listed variables; compare with `apps/api/.env.example`.
- **Port already in use (3000/4000)** - stop the old process, or change `PORT` (API) / run Next with another port. Remember to update `NEXT_PUBLIC_API_BASE_URL` and `CORS_ALLOWED_ORIGINS` to match.
- **Web page says "API unavailable"** - the API is not running, `NEXT_PUBLIC_API_BASE_URL` points elsewhere, or the web origin is missing from the API's `CORS_ALLOWED_ORIGINS`. The page shows the address it is calling.
- **Changed `NEXT_PUBLIC_API_BASE_URL` but nothing changed** - it is inlined at build time; restart `dev:web` or rebuild.
- **`npm audit`/install warns about esbuild install scripts** - harmless: esbuild (via `tsx`/Vitest) works without its optional postinstall check.
