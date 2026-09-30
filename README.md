# ms-conversations

Internal NestJS microservice that owns **conversations** — long-lived, bidirectional message threads between a customer and internal staff. It is the generalized primitive behind virtual-agent quote Q&A (phase one), support tickets, and forum-style threads. A conversation carries a `type` discriminator; "support ticket" is one type/view over the same primitive.

Sibling of `ms-messaging`, scaffolded from the same stack. See [AGENTS.md](AGENTS.md) for architecture and conventions, and [specs/](specs/) for feature specs.

## Integration with ms-messaging

- **messaging → conversations (sync REST):** the virtual-agent-quote workflow creates a conversation when a quote is triggered, so the tokenized landing page can render the thread immediately. Idempotent on `publicId`.
- **conversations → messaging (fire-and-forget REST):** notification emails are delegated to messaging (reusing its SendGrid, suppression, throttling, delivery tracking). A messaging outage never fails a reply.

## Stack

NestJS 11 · pnpm · IBM DB2 for i (ODBC) · RabbitMQ · nestjs-pino · three composition roots (HTTP / CLI / cron).

## Getting started

Local dev runs in Docker (the IBM i Access ODBC driver ships in the image):

```bash
cp .env.template .env          # fill in DB2 / RMQ secrets
docker compose -f docker-compose.dev.yml up --build   # host 6114 -> container 3000
```

Create the host volume dirs first: `/var/docker/logs/ms-conversations` and `/var/docker/data/ms-conversations/documents`.

Swagger UI is served at `/api` when `SWAGGER_ENABLED=true`.

## Common commands

Run inside `backend/`:

```bash
pnpm install
pnpm run build
pnpm run start:dev
pnpm test
pnpm run lint
pnpm run cli db-ping           # example operational command
```

## Composition roots

| Entrypoint | Module | Purpose |
|---|---|---|
| `dist/main` | `AppModule` | HTTP server |
| `dist/cli <command>` | `ScriptsModule` | operator/debug CLI (stderr-only logging) |
| `dist/cron <job> --actor <id>` | `CronModule` | scheduled jobs (gated by `CRON_ENABLED` + `CRON_JOBS`) |

## Deployment

- `docker-compose.prod.yml` — the API service (`ms-conversations-backend:prod`).
- `docker-compose.cron.yml` — the cron container (`FROM` the prod image + supercronic; own compose project `-p ms-conversations-cron`). Build the prod image first.

## Status

Infrastructure + the three composition roots are scaffolded and green (build + lint + unit tests). The `conversation/` domain is a skeleton — build it from [specs/virtual-agent-quote](specs/virtual-agent-quote/requirements.md).
