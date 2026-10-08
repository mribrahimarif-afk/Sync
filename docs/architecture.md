# Architecture

> **Read this first:** the _Implemented foundation_ section describes what exists in this repository today. Everything under _Target architecture_ is a plan that later tasks must deliver; none of it is implemented or guaranteed yet.

## Implemented foundation

| Area         | Choice (pinned in `package-lock.json`)                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| Runtime      | Node.js 24.20.0 (Active LTS), npm 11.19.0, npm workspaces                                                   |
| Language     | TypeScript 6.0.3, `strict` plus `noUncheckedIndexedAccess`                                                  |
| API          | Fastify 5.12.5 with `@fastify/cors` 11.3.1, `@fastify/helmet` 13.1.1, `@fastify/rate-limit` 11.2.0          |
| Web          | Next.js 16.4.0 (App Router, Turbopack) with React 19.3.0                                                    |
| Worker       | Plain Node process with pino 10.4.0 logging                                                                 |
| Config       | zod 4.6.5 validates environment variables in API and worker                                                 |
| Tests / lint | Vitest 5.0.3, Testing Library + jsdom (web only), ESLint 10.12.0 + typescript-eslint 8.71.1, Prettier 3.9.9 |

**Compatibility rationale.** Next 16.4 supports React 19 and Node >= 20.9; Fastify 5 plugins at these versions target Fastify 5; Vitest 5 and ESLint 10 require Node 22.13/24+, which Node 24 satisfies. TypeScript is pinned to 6.0.3 rather than the newest 7.x because typescript-eslint 8.71.1 declares support for `typescript >=4.8.4 <6.1.0`. Revisit when typescript-eslint supports 7. No version was copied from the legacy project.

### What runs today

- `apps/api` - `buildApp()` creates the Fastify instance without listening (so tests never bind a port); `main.ts` handles configuration, listening, signals and exit codes. One route: `GET /api/health`, which reports only that the process is serving requests. It does not probe, and so does not claim, any database, queue or provider.
  - **Error contract:** every failure (unknown route, malformed or invalid input, oversized body, rate limit, unexpected exception) is returned as `{ error: { code, message, requestId, details? } }` with the correct HTTP status. Unexpected errors return a generic message; causes are logged server-side only.
  - **Request IDs:** a UUID is generated, or an incoming `X-Request-Id` is accepted only if it is 8-64 safe characters; it is returned in the header and error body and bound to every log line.
  - **Logging:** structured JSON; request logs hold method, path (query string removed) and client address only; credentials-like keys are redacted; bodies are not logged.
  - **HTTP baseline:** Helmet headers, `Cache-Control: no-store`, explicit CORS allowlist (wildcards rejected), body-size limit, per-client rate limit, and forwarded headers ignored unless `TRUSTED_PROXIES` is set.
- `apps/worker` - validated config, structured logging, signal handling and clean exit. It states at startup that durable job processing is not implemented, and connects to nothing.
- `apps/web` - one status page that calls the API once, shows loading / reachable / unavailable (with request ID when available), and only retries when the user asks. In-flight requests are aborted on unmount, retry and target change; late results cannot overwrite newer state.
- `packages/contracts` - the health and public-error types plus runtime type guards, with no dependencies. It is compiled to `dist` and consumed through that output in development, tests and production alike, so all environments resolve it identically.

### Deliberate foundation choices

- **Contracts are compiled, not aliased from source.** One resolution path everywhere avoids dev/prod drift; the cost is building contracts first, which root scripts do.
- **Type guards instead of a validation library in contracts** keep the package dependency-free and the browser bundle small. Reconsider if contracts grow.
- **Custom dev runner (`scripts/dev.mjs`)** instead of a process-manager dependency, because reliable whole-tree cleanup on Windows needed `taskkill /T`.
- **Redaction lists are duplicated** in API and worker rather than introducing a shared runtime package for ~10 lines.

## Target architecture (planned, not implemented)

Sync is a **modular monolith**: one API deployable plus a separately run worker, with explicit module ownership. No microservices until a measured need exists.

### Modules

| Module                       | Owns (planned)                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Identity / Organization      | Organizations, branches, staff profiles, login accounts, role templates, custom roles, permissions   |
| Members                      | Member profiles, optional sensitive fields, documents, custom fields, import/export, history         |
| Catalogue                    | Offerings, membership plans, bundles, pricing                                                        |
| Subscriptions / Entitlements | Subscriptions, renewals, upgrades/downgrades, freeze/resume, cancellation, entitlements              |
| Scheduling                   | Trainers, classes, recurring sessions, bookings, batches, appointments, waitlists                    |
| Attendance / Access          | Check-in/out, QR cards, access decisions, automatic checkout, biometric device mappings              |
| Billing                      | Invoices, payments, allocations, dues, member credit, refunds, approvals, payment-provider contracts |
| Staff / Payroll              | Staff attendance, leave, compensation, payroll, payslips                                             |
| Operations / POS             | Cash registers, expenses, inventory, POS, rentals                                                    |
| Communications               | In-app notifications, consent, templates, triggers, queues, delivery history                         |
| Reporting                    | Dashboards, reports, exports with named definitions                                                  |
| Integrations                 | Provider/device adapters, webhooks, integration configuration                                        |

### Principles

- **Thin HTTP handlers.** Handlers parse input, call an application service, and map results. Domain and application rules live outside Fastify and are testable without HTTP or a database.
- **Module boundaries.** A module's tables are accessed only by that module. Cross-module needs go through its exported application interface; any direct cross-module database access needs an explicitly approved boundary documented here.
- **Authorization at four levels:** organization, branch, record and field. Permission checks are server-side and centralized.
- **Member identity is separate from subscriptions.** A person exists independently of any plan, and holds many independent subscriptions.
- **Financial history is immutable.** Posted records are never edited or deleted; mistakes are fixed by explicit correcting entries (reversal, credit note, refund) with actor, reason and audit trail.
- **Money.** Decimal arithmetic (never binary floats), PKR default, one documented rounding rule applied in one place.
- **Time.** Instants are stored in UTC. Business dates (membership start/expiry, due dates) are date-only values interpreted in the branch's timezone (default `Asia/Karachi`), never derived from UTC timestamps by accident.
- **Transactions, concurrency, idempotency.** State changes are transactional; contended records use optimistic or explicit locking; externally retried operations (payments, webhooks, device events) carry idempotency keys and are deduplicated.
- **Durable outbox and workers.** Side effects (notifications, provider calls, exports) are written to a transactional outbox and executed by the separately run, separately monitored worker with retries and delivery history. The worker skeleton exists; the outbox and queue do not.
- **Private files.** Member documents and exports are stored privately and served only through authorized, expiring access - never public URLs.
- **Provider and device adapters.** Payment, WhatsApp and biometric integrations sit behind contracts with mock implementations for testing. Live connections are on hold (see [delivery](delivery.md)).
- **Reporting definitions.** Every report metric has a written definition (what counts, which dates, which branches) so numbers are reproducible.
- **Separate concepts.** Member profile state, subscription lifecycle, invoice/payment state with outstanding balance, and physical access decision are distinct models, never collapsed into one status field.

### Technology planned for later tasks

PostgreSQL with Prisma for persistence and migrations; a durable queue/outbox for the worker. These are chosen but **not installed or connected** in this foundation.
