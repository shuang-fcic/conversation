# Design — Virtual Agent Quote Conversation

> **Status:** Draft · **Last updated:** 2026-09-30 · **Owner:** Scott Huang

Implements [requirements.md](requirements.md). This is the phase-one build of the
`conversation/` domain module on top of the scaffolded infrastructure.

## Key decisions (settled)

| Decision | Choice | Rationale |
|---|---|---|
| Primitive | `Conversation` + `Message`, generalized by a `type` enum | One model for quote Q&A, tickets, forum; "ticket" is a type/view (R2) |
| messaging → conversations | **Synchronous REST**, idempotent on `publicId` | Customer opens the landing page immediately after the quote email; the thread must already exist (R1.3) |
| conversations → messaging (notify) | **Fire-and-forget REST** to messaging | Reuse messaging's SendGrid/suppression/throttle/delivery; a notify outage must not fail a reply (R10.3–R10.4) |
| Rich text | Store **TipTap JSON**, render/sanitize server-side | No unsanitized client HTML persisted or emailed (R14) |
| Notification throttling | **Notify-until-read** (edge-triggered) | One email per unread burst; no timer/cron needed (R10) |
| Customer identity | **Tokenized URL** (ack-flow pattern) | No login for phase one; portal/JWT deferred (R4, R18) |

## Component map

```
backend/src/conversation/
  conversation.module.ts            ← wires the below (currently an empty skeleton)
  conversation.controller.ts        ← agent + create endpoints (x-app-source guarded)
  conversation.customer.controller.ts ← token-authorized customer read/reply/read-mark
  conversation.service.ts           ← orchestration hub (create, reply, assign, status, read)
  conversation.error.ts             ← ConversationNotFound, InvalidAccessToken, …
  conversation.type.ts              ← {Verb}{Noun}Params + enums (TYPE, STATUS, AUTHOR_TYPE, VISIBILITY)
  notification/
    conversation-notifier.service.ts ← notify-until-read decision + delegate to messaging
    messaging.client.ts             ← fire-and-forget HTTP client to ms-messaging
  token/
    access-token.service.ts         ← mint / hash / verify customer tokens
  record/
    conversation.record.service.ts  ← SQL for CONVERSATION
    conversation.schema.ts          ← Db2TableSchema (single source of truth)
    message.record.service.ts       ← SQL for MESSAGE
    message.schema.ts
  audit/
    conversation-audit.service.ts   ← typed audit events
    conversation-audit.constant.ts
  richtext/
    richtext.render.ts              ← TipTap JSON -> sanitized HTML (shared by web + email)
```

Reuses infra as-is: `DatabaseModule` (`Db2Repository`, `withTransaction`,
`toDb2Timestamp`), `AuthModule` (guard + `@AllowedAppSources` + `@UserId`),
`AlertingModule`, `CachingModule`, `HealthModule`, `RmqModule` (only if R17 is
taken). New config namespace `conversation.config.ts` (see Configuration).

## Data model (DB2, schema `MSCONV`)

Column shapes are authoritative in the `*.schema.ts` descriptors; the DDL below
is the intent. All tables get `CREATED_DATE_TIME`/`UPDATED_DATE_TIME`
`DEFAULT CURRENT_TIMESTAMP` (DB-stamped; see AGENTS.md DB2 rules) plus
`CREATED_BY`/`UPDATED_BY`.

### CONVERSATION

| Column | Kind | Notes |
|---|---|---|
| `ID` | identity PK | |
| `PUBLIC_ID` | char/varchar, unique | idempotency key (R1.2) + external id |
| `TYPE` | varchar enum | `VIRTUAL_AGENT_QUOTE` (R2.2) |
| `SUBJECT` | varchar | |
| `STATUS` | varchar enum | see status lifecycle |
| `ASSIGNEE_ID` | varchar, nullable | the agent (`x-user-id`) (R2.3) |
| `CUSTOMER_NAME` | varchar | denormalized contact |
| `CUSTOMER_EMAIL` | varchar | notification target |
| `EXTERNAL_REF` | varchar, nullable | messaging `messageRecordPublicId` / `applicationId` |
| `ACCESS_TOKEN_HASH` | varchar | hashed customer token (R4.1) |
| `CUSTOMER_LAST_READ_MESSAGE_ID` | int, nullable | read tracking (R9) |
| `ASSIGNEE_LAST_READ_MESSAGE_ID` | int, nullable | read tracking (R9) |

> Customer/assignee live as columns for phase one but are treated as relations
> conceptually; phase two introduces a `CONVERSATION_PARTICIPANT` table
> (participant + role + `lastReadMessageId`) and migrates these columns into it
> (R2.3, R18). Keep read-state access behind a small accessor so that migration
> touches one place.

### MESSAGE

| Column | Kind | Notes |
|---|---|---|
| `ID` | identity PK | monotonic; also the read-marker cursor (R9) |
| `CONVERSATION_ID` | int FK | |
| `AUTHOR_TYPE` | varchar enum | `CUSTOMER \| AGENT \| SYSTEM` |
| `AUTHOR_ID` | varchar, nullable | `x-user-id` for AGENT; null for SYSTEM |
| `BODY_JSON` | clob | TipTap document JSON (R14.1) |
| `VISIBILITY` | char/varchar enum | `PUBLIC \| INTERNAL` (R3.1) |

### Tags (phase two)

`TAG` + `CONVERSATION_TAG` join — **not built this iteration** (R18). Mentioned so
the schema descriptors leave room; do not add columns to `CONVERSATION` for tags.

## Status lifecycle (R8)

`OPEN` (created) → `PENDING_CUSTOMER` (agent replied, awaiting customer) →
`ANSWERED` (customer replied, awaiting agent) → `RESOLVED` (agent marks done) →
`CLOSED` (terminal).

- Agent `PUBLIC` reply: `OPEN`/`ANSWERED` → `PENDING_CUSTOMER`.
- Customer reply: `OPEN`/`PENDING_CUSTOMER` → `ANSWERED`; on `RESOLVED`/`CLOSED`
  → reopen to `ANSWERED` and notify assignee (R8.3 default).
- `INTERNAL` notes do **not** change status.
- All transitions audited (R8.2). Enforce transitions in the service, not the DB.

## Notify-until-read algorithm (R10)

Edge-triggered, no timer. On appending a `PUBLIC` message `m` to conversation `c`,
for the recipient `r` (the party that is *not* the author):

```
prevLatestId = latest message id BEFORE m   // i.e. m's predecessor
wasCaughtUp  = (r.lastReadMessageId == prevLatestId)   // null-safe: null == "no prior messages"
if wasCaughtUp:
    delegateNotification(r, c)   // fire-and-forget to messaging
# else: r already had unread; suppress (they'll get re-armed on read-mark)
```

- The author's own read marker SHOULD be advanced to `m.id` on post (they've
  "read" what they wrote), so they aren't considered behind.
- Assignment (R11) bypasses this entirely and always notifies.
- Do the decision inside the same transaction that appends the message (read the
  markers with the write lock) so concurrent replies can't both see "caught up"
  and double-send. The actual delegate call happens **after commit**
  (fire-and-forget), so a notify failure can't roll back the reply.

## Integration seams

### messaging → conversations (create, R1)

`POST /conversations` guarded by `@AllowedAppSources(MS_MESSAGING)`. Body: DTO with
`publicId`, customer, `externalRef`, optional `assigneeId`, optional opening
message (TipTap JSON). Idempotent: look up by `publicId` under a write lock;
return existing (200) or create (201). Returns the conversation + the
customer landing URL (built from `CONVERSATION_FRONTEND_URL` + token).

> On the messaging side this is a new step in its virtual-agent-quote workflow
> (a REST call to this service). Keep messaging's call idempotent-retry-safe by
> reusing the quote's stable id as `publicId`.

### conversations → messaging (notify, R10/R11)

`notification/messaging.client.ts` POSTs to messaging's message-start endpoint
with `x-app-source: <this service>` and a **notification workflow + template**
that must be added on the messaging side (a small templated email:
"you have a new reply / a quote was assigned to you", linking back). Fire-and-forget:
`.catch()` logs + alerts, never throws into the caller. If durability is wanted
later, flip this to an RMQ publish that messaging consumes (see R17 and the
messaging integration note in AGENTS.md) — no reply event needed for a
notification.

### Config (`conversation.config.ts`, new namespace)

- `MESSAGING_BASE_URL` — messaging base URL for the notify client.
- `CONVERSATION_FRONTEND_URL` — public base for the tokenized customer link.
- (token TTL / pepper if the token scheme needs one.)

Register in `common/setup/config-module.options.ts` `NAMESPACES` (one line).
Remember: `*.config.ts` is blocked for the Read/Write/Edit tools — use the
`nestjs-config` skill or shell `node`.

## Rich text (R14)

`richtext/richtext.render.ts` is the single path from stored TipTap JSON to
sanitized HTML, used by both the web thread response and the email body handed to
messaging. Persist only the JSON doc; render on read. Enforce a per-message byte
cap on the JSON before insert.

## Auth (R16)

- Create: `@AllowedAppSources(MS_MESSAGING)`.
- Agent read/reply/assign/list: `@AllowedAppSources(RC_NEXT)` + `@UserId()` actor.
- Customer read/reply/read-mark: a token guard (new, small) that resolves the
  conversation from the token and attaches it to the request; **no** app-source.
  Reject invalid tokens uniformly (R4.3).

## Testing plan

- **Unit:** `ConversationService` (create-idempotency, reply→status transition,
  reopen-on-closed, assignment); the **notify-until-read decision** (caught-up vs
  behind vs author-self) as a pure-ish function with mocked records; token
  hash/verify; richtext render sanitizes hostile JSON. Mock `Db2Repository`,
  the messaging notify client.
- **E2E:** create (app-source + idempotency), agent reply vs internal note
  (customer never sees INTERNAL), customer token read/reply, auth rejections
  (missing app-source, bad token), status codes.
- **Integration:** schema-contract for `CONVERSATION` + `MESSAGE` against DEV DB2.

## Open questions (resolve during build)

1. Messaging notification transport: a dedicated notification **workflow** vs a
   lighter direct email endpoint on messaging — needs a small messaging-side
   change either way. (Leaning: a notification workflow, so throttle/suppression/
   delivery tracking apply.)
2. Whether `SUBJECT` is derived (e.g. "Quote #{externalRef}") or caller-supplied
   at create.
3. Token scheme specifics (length, hash algo, whether it expires) — mirror the
   messaging ack token exactly if possible.
