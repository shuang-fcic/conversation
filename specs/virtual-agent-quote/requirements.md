# Requirements — Virtual Agent Quote Conversation

> **Status:** Draft · **Last updated:** 2026-09-30 · **Owner:** Scott Huang

## Introduction

Phase one of `ms-conversations`: a **conversation** thread that lets a customer
and an internal **agent** exchange messages about a virtual-agent **quote**.
Today, a customer with a question about their quoted product has only an
`mailto:` anchor with a pre-filled subject; this replaces that with a tracked,
bidirectional thread.

The conversation is created by the `ms-messaging` **virtual-agent-quote workflow**
(which owns the quote email + accept/decline landing page — see that project's
`specs/virtual-agent-quote`). This service owns the **Q&A thread** attached to
that quote: the customer reads and replies through the same tokenized landing
page; the assigned agent reads and replies through an internal page; both get
email notifications (sent **by** `ms-messaging` on this service's behalf).

**Conversation is the general primitive** (`Conversation` + `Message`), carrying
a `type` discriminator. This iteration implements only `type = VIRTUAL_AGENT_QUOTE`,
but the model must generalize to `SUPPORT_TICKET` and forum threads without a
schema rewrite. "Support ticket" will be a later `type` and view, not a new table.

**The service is domain-agnostic.** It stores threads, messages, assignment,
status, read state, and visibility — nothing more. All virtual-agent-quote
business logic (quote data, accept/decline, *when* to open a conversation, the
drawer UI) lives in ms-messaging and the rcNext ack landing page; only generic
fields and an opaque `externalRef` cross the boundary. This spec lives here
because VAQ is the *first consumer* that drives the build — not because the
service is quote-specific.

**Explicitly deferred to a later iteration (phase two):** support-ticket type,
tags/categories, departments, a customer support widget + "my tickets" page,
real customer authentication (portal session/JWT), participants beyond one
customer + one assignee, SLA timers, and French copy. These are out of scope
here but must not be *precluded* by phase-one decisions (see R2, R3, R9).

## Requirements

### R1 — Create a conversation (messaging → conversations, synchronous)

**User story:** As the messaging virtual-agent-quote workflow, I want to create
a conversation when a quote is sent, so the customer can immediately ask
questions from the landing page.

#### Acceptance criteria

1. The service SHALL expose an authenticated endpoint (`x-app-source: ms-messaging`)
   that creates a `Conversation` of `type = VIRTUAL_AGENT_QUOTE` from: customer
   identity (name, email), an `externalRef` linking back to the quote
   (e.g. the messaging `messageRecordPublicId` / `applicationId`), an optional
   initial `assigneeId` (the agent), and an optional opening `Message`.
2. Creation SHALL be **idempotent** on a caller-supplied `publicId`: a repeated
   call with the same `publicId` returns the existing conversation (200), not a
   duplicate (no second row, no second audit-create).
3. The call SHALL be **synchronous** — the workflow depends on the conversation
   existing before it returns the tokenized link to the customer. A failure
   SHALL surface to the caller (non-2xx) so the workflow can retry.
4. Creation SHALL mint a **customer access token** (see R4) and return it (plus
   the conversation `publicId`) to the caller. This service returns the
   token/ids only — **URL construction is the frontend's job** (R4), so no
   customer frontend URL is configured or built here.

### R2 — Conversation data model (generalizable)

#### Acceptance criteria

1. A `Conversation` SHALL persist: `id`, `publicId` (idempotency + safe external
   id), `type` (**enum**, `VIRTUAL_AGENT_QUOTE` for now), `subject`, `status`
   (see R8), `assigneeId` (nullable — the agent), `customerId`/denormalized
   customer contact, `externalRef` (nullable), and DB-stamped audit columns.
2. `type` SHALL be an enum column, not a boolean flag, so new kinds add a value
   rather than a column.
3. Customer and assignee SHALL be modeled as relations/foreign keys (not embedded
   blobs), so a participants table can supersede them in phase two without a
   data migration of message rows.
4. The backend SHALL treat `type` as an **opaque discriminator** for
   filtering/views only — it SHALL NOT branch business logic on the type value.
   Use-case rules (what a "quote" is, accept/decline, quote rendering, *when* to
   open a conversation) live in the consumer (ms-messaging + rcNext), never here.

### R3 — Message data model

#### Acceptance criteria

1. A `Message` SHALL persist: `id`, `conversationId`, `authorType`
   (`CUSTOMER | AGENT | SYSTEM`), `authorId` (nullable for SYSTEM), `body`
   (rich text — see R14), `visibility` (`PUBLIC | INTERNAL`), and a DB-stamped
   `createdAt`.
2. The opening post SHALL be an ordinary `Message` (the first row), not a special
   field on `Conversation` — one shape for every entry in the thread.
3. `visibility = INTERNAL` messages (agent-only notes) SHALL never be returned on
   the customer-facing read path (R13), even in phase one where the authoring UI
   for them may be minimal.

### R4 — Tokenized customer access

**User story:** As a customer, I want to open my quote conversation from the
email link without logging in.

The customer UI is a **slide-in drawer embedded in the messaging/rcNext ack
landing page** (not a standalone page this service hosts). The frontend holds the
access token and constructs its own URLs; this service exposes only
token-authorized APIs and stores no customer frontend URL.

#### Acceptance criteria

1. Each conversation SHALL have an opaque, unguessable **access token** that
   resolves to exactly that conversation (mirror the messaging acknowledgement
   token pattern). The token SHALL be stored hashed, compared in constant time.
2. Presenting a valid token SHALL authorize the customer read (R13) and reply
   (R5) paths for that one conversation — no `x-app-source` required on those
   routes.
3. An invalid/absent token SHALL be rejected (no information leak about whether
   the conversation exists).

### R5 — Customer posts a reply

#### Acceptance criteria

1. A customer with a valid token SHALL be able to append a `Message`
   (`authorType = CUSTOMER`, `visibility = PUBLIC`) to their conversation.
2. Posting SHALL be audited and SHALL trigger the notify-until-read evaluation
   for the assignee (R10).
3. Posting to a `CLOSED`/`RESOLVED` conversation SHALL follow the status rules in
   R8 (either reopen or reject — decided there).

### R6 — Agent posts a reply or internal note

#### Acceptance criteria

1. An authenticated agent (`x-app-source: rc-next`, `x-user-id` = agent) SHALL be
   able to append a `Message` to a conversation, choosing
   `visibility = PUBLIC` (customer-visible reply) or `INTERNAL` (agent-only note).
2. A `PUBLIC` agent reply SHALL trigger the notify-until-read evaluation for the
   customer (R10); an `INTERNAL` note SHALL NOT notify the customer.
3. Agent posts SHALL be audited with the acting `x-user-id`.

### R7 — Assignment

#### Acceptance criteria

1. An agent/conversation SHALL be assignable and re-assignable
   (`assigneeId`), audited with the actor.
2. Assigning a conversation to an agent SHALL notify that agent immediately (R11),
   independent of read state.

### R8 — Status lifecycle

#### Acceptance criteria

1. A conversation SHALL carry a **generic, domain-agnostic** `status`:
   `OPEN → PENDING → RESOLVED → CLOSED`. The backend SHALL NOT encode
   use-case-specific states or transition rules. A consumer that needs
   "who are we waiting on" uses the generic `waitingOn` (`CUSTOMER | AGENT | null`),
   not new status values.
2. Status transitions SHALL be audited with the actor. The backend enforces only
   generic validity (e.g. reopen-on-reply below), not per-use-case policy.
3. The behaviour of a reply to a `RESOLVED`/`CLOSED` conversation SHALL be defined
   (default: reopen to `OPEN` and notify the other party) rather than silently
   dropped.

### R9 — Read tracking

**User story:** As the notification engine, I need to know whether a participant
has caught up, so I can send exactly one email per unread burst (R10).

#### Acceptance criteria

1. Each participant (customer, assignee) SHALL have a `lastReadMessageId` (or
   equivalent) on the conversation, advanced when they open/view it.
2. A read-mark endpoint SHALL exist for each side (customer via token, agent via
   `x-app-source`).
3. Read state SHALL support an unread indicator per side (count or boolean).

### R10 — Notify-until-read (delegated, fire-and-forget)

**User story:** As an agent (or customer), I want one email when the other side
writes, not one per message in a burst.

#### Acceptance criteria

1. When a `PUBLIC` message is appended, the service SHALL notify the *other*
   party **only if they were caught up** (their `lastReadMessageId` == the
   previous latest message) — i.e. edge-triggered on the first unread message.
   If they already had unread messages, no additional email SHALL be sent.
2. The recipient SHALL be re-armed (eligible to be notified again) once they
   advance their read marker (R9).
3. Notifications SHALL be **delegated to `ms-messaging`** (this service does not
   call SendGrid directly), reusing its suppression/throttling/delivery tracking.
4. The call to messaging SHALL be **fire-and-forget**: a messaging outage SHALL
   be logged (and optionally queued for retry) but SHALL NOT fail the reply that
   triggered it.
5. The author of a message SHALL never be notified of their own message.

### R11 — Assignment notification

#### Acceptance criteria

1. Assigning a conversation to an agent SHALL always send that agent one
   notification (delegated per R10.3–R10.4), regardless of read state — this is a
   distinct notification kind from R10 and throttles independently.

### R12 — Agent views

**User story:** As an agent, I want to see the quote conversations assigned to
me and their status.

#### Acceptance criteria

1. An authenticated endpoint SHALL list conversations filtered by `assigneeId`
   and `status`, ordered deterministically (e.g. most-recent-activity), with the
   unread indicator (R9).
2. An authenticated endpoint SHALL return a single conversation with its full
   message thread including `INTERNAL` notes, for the assigned agent.

### R13 — Customer view

#### Acceptance criteria

1. A token-authorized endpoint SHALL return the customer's conversation with its
   `PUBLIC` messages in order, plus the unread indicator — **never** `INTERNAL`
   notes (R3.3).

### R14 — Rich-text message bodies

#### Acceptance criteria

1. Message bodies SHALL be stored as the editor's **structured JSON document**
   (TipTap/ProseMirror doc model), not raw HTML.
2. Rendering to HTML (for the web thread and for email notifications) SHALL happen
   **server-side through one shared sanitizer/renderer**, so no unsanitized
   client HTML is ever persisted or emailed.
3. The stored document SHALL be size-bounded (the 20mb body limit is the ceiling;
   a tighter per-message limit is defined in `design.md`).

### R15 — Audit trail

#### Acceptance criteria

1. Every meaningful state change — conversation created, message posted (with
   `authorType`/`visibility`), assigned, status changed, notification dispatched —
   SHALL be written through an audit service with a typed event type and a
   correlation key (`conversationPublicId`).

### R16 — Auth

#### Acceptance criteria

1. Programmatic endpoints SHALL be guarded by `InternalServiceAuthGuard` +
   `@AllowedAppSources(...)`: `MS_MESSAGING` for create (R1), `RC_NEXT` for agent
   endpoints (R6, R7, R12). No whitelist = deny-all.
2. Customer endpoints (R5, R13, and the customer read-mark in R9) SHALL be
   authorized by the access token (R4), not `x-app-source`.
3. `x-user-id` SHALL be threaded through as the audit actor on agent actions.

### R17 — Outbound events (optional this iteration)

#### Acceptance criteria

1. IF lifecycle events are published, they SHALL go through the RMQ service to a
   durable exchange, be audited, and tolerate at-least-once redelivery. Absent a
   consumer need, this MAY be deferred — the audit trail (R15) is the durable
   record.

### R18 — Deferred (phase two) — non-regression guardrails

These are **out of scope** now but listed so phase-one code keeps them cheap:
support-ticket `type`; tags (many-to-many join) + categories + departments;
customer widget + "my tickets"; portal/JWT customer auth; a participants table;
SLA. Phase-one schema choices (R2.2, R2.3, R3, R9) exist specifically to make
these additive.
