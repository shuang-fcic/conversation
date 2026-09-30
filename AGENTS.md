# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, and others) when working with code in this repository.

## Overview

`ms-conversations` is an internal NestJS microservice that owns **conversations** — long-lived, bidirectional message threads between a customer and internal staff. It is the generalized primitive behind three eventual use cases: **virtual-agent quote Q&A** (phase one), **support tickets**, and **forum-style threads**. A conversation carries a `type` discriminator and a set of participants; "support ticket" is one type and one view over the same primitive, not a separate table.

The service is a **sibling of `ms-messaging`** and was scaffolded from the same stack (NestJS 11 + pnpm, IBM DB2 for i over ODBC, RabbitMQ, SendGrid-via-messaging, nestjs-pino, three composition roots). Where messaging orchestrates one-shot templated sends, conversations tracks stateful back-and-forth. The two integrate:

- **messaging → conversations (sync REST):** the virtual-agent-quote workflow creates a conversation when a quote is triggered, so the tokenized landing page can render the Q&A thread immediately. Idempotent on `publicId`.
- **conversations → messaging (fire-and-forget REST):** when a reply/assignment needs an email, conversations asks messaging to send it (reusing messaging's SendGrid, suppression, throttling, delivery tracking). A messaging outage must never fail the customer's reply.

All code lives in [backend/](backend/). Commands below assume that directory unless noted.

> **Current status:** the infrastructure and three composition roots are scaffolded and green (build + lint + unit tests). The **domain** (`conversation/`) is a skeleton — the Conversation + Message engine is defined by the [virtual-agent-quote spec](specs/virtual-agent-quote/requirements.md) and built on top. Read that spec before writing domain code.

## Deployment & design philosophy

Deployed as a **single instance** on an on-premise server, behind a firewall, reachable only by trusted internal callers (hence the lightweight `x-app-source` auth). That is the *current* topology, not a constraint to design around.

**Write code as if it runs in a distributed system**, even though it doesn't today:

- Treat in-process state (module fields, `EventEmitter` listeners) as per-instance and ephemeral. Anything that must survive a restart or be shared belongs in DB2.
- Make operations safe to run concurrently and to retry. Use `withTransaction` + row locks rather than read-modify-write races. Lean on the audit trail + `publicId` idempotency keys instead of assuming exactly-once delivery.
- Assume RabbitMQ delivery is at-least-once and possibly out of order; consumers/replays should tolerate duplicates.

**Known, deliberate exceptions** (don't "fix" without discussion): **No Redis.** If you need caching, use the built-in in-memory `CachingModule` (per-instance) — propose it rather than reaching for a distributed cache. Cross-instance coordination relies on DB2 + the in-process event emitter, acceptable precisely because there is one instance. Flag, don't silently assume, anything that would break under multiple instances.

## Spec-driven development

Feature specs live in [specs/](specs/) — **one folder per feature** (not per ticket), each with `requirements.md` (WHAT + numbered `R1…` acceptance criteria), `design.md` (HOW + component map/decisions), and `tasks.md` (only the in-flight iteration's checklist). `requirements.md`/`design.md` always describe the feature **as it should behave today** — edit them in place, never append "delta" sections; requirement numbers are **append-only**. Iteration history lives in git. See [specs/README.md](specs/README.md). When implementing or changing a feature, keep its spec docs in sync with the code you land.

## Commands

The package manager is **pnpm**. Run inside `backend/`:

```bash
pnpm install            # first-time setup (installs deps; needs the IBM ODBC toolchain — use Docker)
pnpm run build          # nest build -> dist/
pnpm run start:dev      # watch mode
pnpm run cli <command>  # operational CLI command
pnpm run lint           # eslint --fix over {src,apps,libs,test}
pnpm test               # jest (unit, *.spec.ts under src/)
pnpm test -- path/to/file.spec.ts   # single file
pnpm run test:e2e       # jest with test/jest-e2e.json
pnpm run test:integration  # DEV DB2 read-only contract tests (self-skip without DB2_TEST_*)
```

### Running locally (Docker)

The service requires the IBM i Access ODBC driver (installed in the Docker image), so local dev runs in a container:

```bash
# from repo root
cp .env.template .env          # then fill in DB2/RMQ secrets
docker compose -f docker-compose.dev.yml up --build   # host port 6114 -> container 3000
```

Host dirs `/var/docker/logs/ms-conversations` and `/var/docker/data/ms-conversations/documents` must exist. The `Dockerfile` is multi-stage: `base` (OS + IBM ODBC drivers) → `deps` → `builder` → `runner`.

## Architecture

### Composition roots (three entrypoints)

Like messaging, this service has three process bootstraps at `backend/src/`, each a peer composition root:

- [main.ts](backend/src/main.ts) → `AppModule` — the HTTP server. Wires the pino file logger, global validation pipe, throttler guard, alerting exception filter + server subscribers.
- [cli.ts](backend/src/cli.ts) → `ScriptsModule` — nest-commander CLI for operator/debug actions with no UI consumer. Logs to **stderr only** (never the server's rolling `app.log`; pino-roll isn't multi-writer safe), keeps stdout for command output. Exit codes in [exit-code.constant.ts](backend/src/common/constants/exit-code.constant.ts) (0 success, 2 domain failure, 1 otherwise). Example command: [db-ping](backend/src/scripts/commands/db-ping.command.ts).
- [cron.ts](backend/src/cron.ts) → `CronModule` — the dedicated cron container. Enforces the `CRON_ENABLED` kill switch + `CRON_JOBS` allowlist before Nest/DB2/RMQ init, wires pino to **per-job** files, and boots job `CommandRunner`s. All jobs extend [`CronCommand`](backend/src/cron/cron.command.base.ts) (owns run timing, the `cron.report` line, exit code) and declare an `execute(ctx)`. Per-run identity via [cron.run.util.ts](backend/src/cron/cron.run.util.ts). Example job: [example-sweep](backend/src/cron/commands/example-sweep.command.ts).

**Endpoint vs. script — the standard.** Keep logic in a transport-agnostic **service**; pick the transport by *who calls it*. Expose an **endpoint** for a remote/programmatic caller (a UI, another service). Use a **script** for a human operator or scheduler with local access, host/instance-local resources, or one-off/maintenance work. Bias debug/ops toward scripts.

### The domain (to build — see the spec)

The `conversation/` module is currently an empty skeleton. Per the [virtual-agent-quote spec](specs/virtual-agent-quote/design.md), it will hold the two core records — **Conversation** (thread metadata: `publicId`, `type`, `subject`, `status`, `assigneeId`, `customerId`, `externalRef`, tags) and **Message** (`conversationId`, `authorType`, `body` as TipTap JSON, `visibility`, per-participant read state) — plus the controller, service, tokenized customer access, and notify-until-read logic. Follow the module/record/schema patterns below.

### Auth model

There is **no user login**. `InternalServiceAuthGuard` ([auth.internal-service-auth.guard.ts](backend/src/auth/guards/auth.internal-service-auth.guard.ts)) trusts an `x-app-source` header checked against the per-route whitelist set by `@AllowedAppSources(...)` (values from [`APP_SOURCE`](backend/src/auth/constants/auth.app-source.constant.ts) — `RC_NEXT`, `MS_MESSAGING`, `CONV_CRON`). `x-user-id` is optional and threaded through as `createdBy`/`updatedBy` for the audit trail. **No whitelist on a route = deny-all.** Customer-facing access for the quote flow is via a **tokenized URL** (no login), not `x-app-source`.

### Database (IBM DB2 for i via ODBC)

- [database.db2.repository.ts](backend/src/database/database.db2.repository.ts) wraps a `generic-pool` of `odbc` connections. Use `query`/`queryOne` for reads and `withTransaction(cb, conn?)` for atomic work. Passing an existing `conn` through nested calls keeps them in the same transaction — this is how services and multi-table operations compose atomically.
- **Timezone gotcha:** DB2 `TIMESTAMP` has no timezone and stores server-local time. Always convert with `toDb2Timestamp(date)` / `fromDb2Timestamp(str)` ([database.db2.utils.ts](backend/src/database/database.db2.utils.ts)); the server offset is detected at startup. Never write raw JS `Date` strings to timestamp columns.
- **Audit timestamps are DB-stamped.** `CREATED_DATE_TIME`/`UPDATED_DATE_TIME` are `DEFAULT CURRENT_TIMESTAMP`; the default only fires on INSERT, so every `update()` must append `UPDATED_DATE_TIME = CURRENT_TIMESTAMP`. The `ModelUpdate<T, K>` helper ([model.interface.ts](backend/src/common/interfaces/model.interface.ts)) enforces this by excluding `updatedAt` from selectable keys.
- Schema via `DB2_SCHEMA` (default `MSCONV`), injected as `databaseConfig.schema`.
- **Table schema descriptors are the single source of truth.** Each table's shape lives in a colocated `*.schema.ts` (`Db2TableSchema` const listing each column's `name`/`kind`/`nullable`). From it, derive the `SELECT` list (`selectColumns(TABLE)`) and the raw-row type (`Db2Row<typeof TABLE>`); the integration schema-contract test asserts the live DEV table against the same const. **Changing a table = edit its `*.schema.ts`.** Shared `kind`→type families live in [database.db2.schema.ts](backend/src/database/database.db2.schema.ts).

### Infrastructure modules present

- `database/`, `rmq/`, `auth/`, `caching/`, `alerting/`, `health/` — ported from messaging and generic. `RmqModule` currently declares only the exchanges (publish-only); add durable queues as consumers are introduced.
- `alerting/` pushes operational alerts to Teams (no-op without `TEAMS_ALERT_WEBHOOK_URL`); server-only wiring (5xx filter, lifecycle/RMQ/DB2 subscribers, process handlers) lives in `AppModule`, not `AlertingModule`, so CLI/cron load the module for DI without firing server triggers.
- `health/` — `GET /health/live` (dependency-free liveness) and `GET /health` (deeper readiness); both unauthenticated and `@SkipThrottle()`d, `/health` always 200 once serving.

## Cross-cutting conventions

- **DTOs everywhere.** Boundaries use class-validator DTOs and `plainToInstance(..., { excludeExtraneousValues: true })` so only `@Expose()`d fields cross. The global `ValidationPipeGlobal` ([validation.pipe.ts](backend/src/common/pipes/validation.pipe.ts)) validates incoming bodies.
- **Import paths.** `./x` only for **same-directory** files; the absolute `src/<module>/…` form (via `baseUrl`) for everything else; `@test/…` for test-support. **Parent-relative `../` imports are banned** (ESLint). Also enforced: `no-cycle`, `no-unresolved`, `no-duplicates`, `order`.
- **Options-object parameters.** A function takes **at most two** params; when it needs more, collapse into one `params` object typed `{Verb}{Noun}Params`. A trailing `conn?: odbc.Connection` is exempt and stays last: `method(params, conn?)`. Fold the actor field (`createdBy`/`updatedBy`) into `params`.
- **Errors** are typed domain classes extending `DomainError` ([domain.error.ts](backend/src/common/error/domain.error.ts)), thrown from services and translated at the boundary (controllers → HTTP, CLI → exit codes). Services stay transport-agnostic. Each module owns its `*.error.ts`.
- **Config** is `@nestjs/config`, **one namespace per module**, co-located as `*.config.ts` (a `registerAs` factory + a class-validator `…Env` DTO). One registry — [config-module.options.ts](backend/src/common/setup/config-module.options.ts) `NAMESPACES` — drives both loading and boot-time validation, and is shared by all three composition roots. **Adding a namespace = write its `*.config.ts` + one line in `NAMESPACES`.** Inject typed config with `@Inject(x.KEY) config: ConfigType<typeof x>`; never read `process.env` directly. (Note: the Read/Write/Edit tools are blocked on `*.config.ts` by permission — use the `nestjs-config` skill or shell `node` to edit them.)
- **Logging** is structured JSON via **nestjs-pino** (loggers declared `new Logger(ClassName)` from `@nestjs/common`, replaced by pino at runtime). **Objects-first:** `logger.log({ ...context }, 'Static message')`. Messages are static/greppable; variables go in the context object. **Always include a correlation key** (`conversationPublicId`, `messageId`, etc.). Levels: `log` lifecycle · `warn` recoverable · `error` (include the caught `error`) · `fatal` invariant violations. The CLI does not wire the file logger (stderr only); cron wires per-job files.
- **Audit trail:** every meaningful state change (create, reply, assign, status change) should be written through an audit service so the trail is the source of truth. Preserve this when adding steps.
- **Comments sparingly.** Explain non-obvious intent, constraints, invariants — not the implementation. Prefer 1–3 lines. Consider whether clearer naming makes the comment unnecessary. Method JSDoc when it clarifies a non-obvious contract, failure mode, or side effect.
- **Throttling:** a global `@nestjs/throttler` tier (guard via `ThrottlerModule.forRootAsync`) plus a tighter `workflow` tier from the `throttler` namespace to override onto write endpoints (create/reply) with `@Throttle`.

## Testing

See [backend/TESTING.md](backend/TESTING.md) for the full reference. Layers:

- **Unit** (`*.spec.ts`, colocated). Pure logic + orchestration. Mock collaborators with `createMock<T>()` from `@golevelup/ts-jest`; often skip `TestingModule` and just `new` the class under test with mocked deps. Never hit real DB2/RMQ.
- **E2E** (`test/*.e2e-spec.ts`). Boot a focused app via [test/support/test-app.ts](backend/test/support/test-app.ts)'s `createTestApp(metadata)` (same global wiring as `main.ts`, no real infra). Assert auth, validation, DTO shaping, error status codes.
- **Integration** (`src/**/*.integration-spec.ts`). The sanctioned exception: a **read-only** connection to the **DEV** DB2 box to verify schema assumptions. Runs only in-container; self-skips without `DB2_TEST_*` via `describeIntegration`.

Conventions: `odbc` is stubbed for unit + e2e ([odbc.mock.ts](backend/test/support/mocks/odbc.mock.ts), via `moduleNameMapper`), so those suites run **outside Docker**. The Nest logger is silenced in both suites. Shared test code lives in [test/support/](backend/test/support/) (aliased `@test/*`), grouped `fixtures/`/`helpers/`/`mocks/` with matching dot-role suffixes; promote a fixture/helper here on its second consumer. Make tests deterministic (freeze time, fixed `publicId`s) and treat retry/idempotency/concurrent paths as first-class.
