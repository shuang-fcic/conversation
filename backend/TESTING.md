# Testing

How we test `ms-messaging`. The suite is Jest + `ts-jest` + `@nestjs/testing`,
with `@golevelup/ts-jest` (`createMock`) for mocking and `supertest` for the HTTP
boundary. Follow these conventions so the suite stays fast, deterministic, and
meaningful.

## Layers

| Layer | Location | Runner | Boots Nest? | Hits infra? |
|-------|----------|--------|-------------|-------------|
| **Unit** | `src/**/*.spec.ts` (colocated) | `pnpm test` | No | No — collaborators mocked |
| **HTTP-boundary** | `test/*.e2e-spec.ts` | `pnpm run test:e2e` | Yes (focused module + supertest) | No — infra providers overridden |
| **Integration** | `src/**/*.integration-spec.ts` (colocated) | `pnpm run test:integration` | No (real `Db2Repository` only) | **Yes** — read-only against the **DEV** DB2 box |

**The "e2e" layer never touches DB2.** Db2 for i runs on IBM i / Power hardware
and has no container image, so it can't be *spun up* in CI. The e2e layer boots
only the `/messages` HTTP surface (routing, guard, global `ValidationPipe`,
workflow validators) with the service layer and workflow registry mocked — see
the `createMessagesTestApp` helper in
[test/messages.e2e-spec.ts](test/messages.e2e-spec.ts), built on the shared
[test/support/test-app.ts](test/support/test-app.ts).
It validates the transport contract (auth, validation, error→HTTP mapping), not
database behaviour. (RabbitMQ *could* be containerized later via a GH Actions
service container if real broker integration is ever wanted; mock it for now.)

The **integration layer** covers what can't be spun up but *can* be reached: it
connects **read-only** to the existing **DEV** DB2 box (the DB team keeps DEV in
sync with PROD) from inside the tester container on the self-hosted runner. See
the dedicated section below.

## Commands

```bash
pnpm test                     # unit tests
pnpm test -- path/to/file.spec.ts
pnpm test -- -t "name"        # by test name
pnpm run test:cov             # unit + coverage
pnpm run test:e2e             # HTTP-boundary tests
pnpm run test:integration     # DEV-DB2 contract tests (in-container; skips w/o DB2_TEST_*)
pnpm run test:ci              # what CI runs (coverage, --ci --runInBand)
```

All three jest configs map `^src/(.*)$` via `moduleNameMapper` — the source uses
`src/...` (baseUrl) imports, which ts-jest can't resolve on its own. The unit and
e2e configs also map `^odbc$` to a stub; the **integration config deliberately
does not** (it needs the real driver).

## Integration (DEV DB2 contract tests)

A third layer that verifies the app's assumptions about the **real schema** —
the thing unit/e2e mocks can't catch: a column renamed/retyped in DB2, or a
required seed row missing. It can't run everywhere, so it's isolated:

- **Real `odbc`, container-only.** The integration jest config
  ([test/jest-integration.json](test/jest-integration.json)) omits the `odbc`
  stub, so importing a spec loads the native driver. That exists only in the
  tester image, so these run **in-container on the self-hosted runner** via
  `pnpm run test:integration`. `pnpm test`/`test:e2e` never pick them up — their
  `testRegex` matches `.spec.ts`/`.e2e-spec.ts`, and `*.integration-spec.ts`
  matches neither.
- **DEV box, read-only.** Config comes from a dedicated, test-only env set
  (`DB2_TEST_*`) — never the app's `database` namespace, so it can't collide with
  a running server. The connection is opened with `ConnectionType=2` (IBM i ODBC
  read-only); pair it with a SELECT-only DB user for defense in depth.
- **Self-skips** when `DB2_TEST_*` is absent (via `describeIntegration`), so a
  runner without DEV access stays green.

Required env (add to your `.env` / CI secrets):

```bash
DB2_TEST_SYSTEM=...      # DEV host/system
DB2_TEST_UID=...         # SELECT-only user recommended
DB2_TEST_PWD=...
DB2_TEST_SCHEMA=...      # DEV schema/library (e.g. MSMSG)
# DB2_CONNECTION_TYPE is set to 2 by the integration harness itself; the prod
# `database` namespace leaves it unset (read/write).
```

Two kinds of check, both read-only:

1. **Per-repo schema contract** (`*.repository.integration-spec.ts`, colocated).
   Introspects `QSYS2.SYSCOLUMNS` and asserts every column the repo reads/writes
   exists with a compatible DB2 type + matching nullability. Row-independent
   (deterministic even against an empty table). The expected shape is the
   table's **single-source descriptor** — a colocated `*.schema.ts` `Db2TableSchema`
   (e.g. [record.schema.ts](src/acknowledgement/record/record.schema.ts)) that
   *also* drives the repository's `SELECT` column list **and the `Db2*` raw-row
   type itself** (derived via `Db2Row<typeof …>`), so the column list is defined
   exactly once. Type families + the `Db2Row` derivation live in
   [database.db2.schema.ts](src/database/database.db2.schema.ts); the assertion in
   [test/support/integration/schema-contract.ts](test/support/integration/schema-contract.ts).
2. **Workflow reference-data contract**
   ([src/message/workflow/workflow.reference-data.integration-spec.ts](src/message/workflow/workflow.reference-data.integration-spec.ts)).
   One test for all workflows: every DB-seeded template a workflow declares —
   ack UI templates via `@Workflow({ requiredAckUiTemplateKeys })` and email
   templates via `requiredEmailTemplateKeys` (both optional) — must resolve
   against DEV through its `findLatestByKey`. Workflows are auto-discovered from
   that metadata, so a new one is covered without editing the test. (SMS/other
   channels aren't DB-backed today, so there's nothing to check for them yet.)

The shared harness
([test/support/integration/integration-db.ts](test/support/integration/integration-db.ts))
boots a real `Db2Repository` against DEV (pool up on init, drained on `close`)
with a pass-through cache and a no-op event emitter.

## Conventions

- **Mock the boundaries, not the unit under test.** Build each `TestingModule`
  (or plain `new`) with the *real* thing under test and mocks for its
  collaborators (`Db2Repository`, `RmqService`, `EmailService`,
  `AcknowledgementService`, `AuditService`, `RecordService`, `WorkflowRegistry`).
- **Mocking (hybrid):**
  - Pure-logic tests (timestamp conversions, SQL utils, guard) use **no**
    mocking library — see [database.db2.utils.spec.ts](src/database/database.db2.utils.spec.ts).
  - Collaborator-heavy tests use `createMock<T>()` from `@golevelup/ts-jest`,
    either as a provider's `useValue` or via
    `Test.createTestingModule(...).useMocker(createMock)`.
- **Workflows:** test by instantiating the class directly (`new PsdWorkflow(...)`).
  The `@Workflow` metadata is read in `WorkflowBase`'s constructor, so a direct
  `new` still resolves the workflow name — you don't need full-app
  `WorkflowRegistry` discovery. See
  [message.psd.workflow.spec.ts](src/message/workflows/message.psd.workflow.spec.ts).
- **Determinism:** never call `new Date()` in an assertion; pass fixed instants
  and pin the DB2 server offset (mock `CachingService.withCache`). Use fixed
  `publicId`s. `clearMocks` + `restoreMocks` are on globally.
- **Assert on the audit trail** for orchestration flows — the audit events are
  the system's source of truth (see [message.service.spec.ts](src/message/message.service.spec.ts)).
- **Treat retry/idempotency and concurrent-cancel as first-class** cases,
  consistent with the distributed-system stance in [CLAUDE.md](../CLAUDE.md).
- **Config in tests:** override a namespace with
  `{ provide: xxxConfig.KEY, useValue: { ... } }`, or pass a cast literal to a
  constructor for a `new`-instantiated unit. `test/setup-e2e-env.ts` seeds dummy
  env vars for the boundary layer (some config is read eagerly at import time,
  e.g. the `@Throttle` decorator).

## Coverage

`pnpm run test:ci` emits `coverage/` (`text-summary`, `lcov`, `cobertura`,
`json-summary`). CI renders a **job summary** on the Actions run page — a
test-results table (unit + e2e pass/fail counts, from jest's `--json` output)
plus a coverage table (from `coverage-summary.json`) — via the GitHub-authored
`github-script` action (org policy forbids third-party actions). The full HTML
report is uploaded as the `coverage-lcov` artifact. Per-step ✅/❌ (lint, build,
unit, e2e) shows natively in the run's step list. Boilerplate (modules, DTOs,
configs, constants, interfaces, entrypoints) and all test files (including
integration specs) are excluded from `collectCoverageFrom` — chase meaningful
coverage of business logic, not the number. The global gate is intentionally
below the current baseline (70% statements/lines, 60% branches/functions)
so ordinary variance does not make it brittle while a material regression still
fails CI. Raise these floors in small steps as the backfill grows; do not weaken
them to land a change.

## CI

[.github/workflows/test.yml](../.github/workflows/test.yml) builds the
Dockerfile `tester` stage once, then runs lint → build → unit+coverage → e2e →
integration inside it on the self-hosted `MSDEV` runner. The host only needs
Docker; the image carries Node, pnpm, unixODBC, and the rebuilt `odbc` addon. The
integration step reaches the DEV DB2 (the runner *is* the DEV box) using the
`DB2_TEST_*` repo secrets, and **self-skips green** if they're unset — so it's in
the PR gate but doesn't block until secrets are provisioned. Runs on PRs and
pushes to `main`/`stable`.
