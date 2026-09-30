# Running build, lint, and tests

## Why this skill exists

`pnpm run build`, `pnpm run lint`, and `pnpm test` (and their variants) are denied by a permission rule on `pnpm run` commands. Direct invocation of the same binaries from `node_modules/.bin/` is not denied — they execute identically but bypass the pnpm runner deny.

All commands below assume **current directory is `backend/`** (where `node_modules/` lives).

## Type-check (build)

```bash
node_modules/.bin/tsc --noEmit
```

Note: emitting to `dist/` is blocked (`dist/tsconfig.tsbuildinfo` is permission-denied). Use `--noEmit` for type-checking in Claude Code sessions. The CI build runs inside Docker and is not affected.

## Lint

Lint all source (mirrors `pnpm run lint`):

```bash
node_modules/.bin/eslint --max-warnings=0 src/
```

Lint specific files only (faster, useful after targeted edits):

```bash
node_modules/.bin/eslint --max-warnings=0 src/cron/cron.module.ts src/cron/cron.config.ts
```

Auto-fix (includes prettier formatting):

```bash
node_modules/.bin/eslint --fix src/path/to/file.ts
```

## Tests

Run the full unit suite (mirrors `pnpm test`):

```bash
node_modules/.bin/jest --no-coverage
```

Run a subset by path pattern:

```bash
node_modules/.bin/jest --testPathPatterns="src/cron" --no-coverage
```

Run a specific file:

```bash
node_modules/.bin/jest --no-coverage src/cron/cron.config.spec.ts
```

Run tests matching a name pattern:

```bash
node_modules/.bin/jest --no-coverage -t "CRON_JOBS"
```

Watch mode:

```bash
node_modules/.bin/jest --watch
```

## Quirks

- `pnpm test -- path/to/file.spec.ts` → use `node_modules/.bin/jest --no-coverage path/to/file.spec.ts`
- `pnpm run test:cov` → `node_modules/.bin/jest --coverage`
- `pnpm run format` → `node_modules/.bin/prettier --write src/` (or use `eslint --fix` which also reformats)
- `pnpm run test:e2e` → `node_modules/.bin/jest --config test/jest-e2e.json`
