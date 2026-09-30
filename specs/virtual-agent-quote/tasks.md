# Tasks — Virtual Agent Quote Conversation (POC iteration)

Active iteration only. Clear on ship; history lives in git.

## Foundation

- [ ] `conversation.config.ts` namespace (`MESSAGING_BASE_URL`,
      `CONVERSATION_FRONTEND_URL`, token settings) + register in `NAMESPACES`.
- [ ] `conversation.type.ts` enums: `CONVERSATION_TYPE`, `CONVERSATION_STATUS`,
      `AUTHOR_TYPE`, `VISIBILITY`, and `*Params` types.
- [ ] `conversation.error.ts` domain errors.

## Persistence (R2, R3, R9)

- [ ] `record/conversation.schema.ts` + `message.schema.ts` (Db2TableSchema).
- [ ] DDL for `CONVERSATION` + `MESSAGE` in `MSCONV` (DB-stamped audit columns).
- [ ] `conversation.record.service.ts` (create, getByPublicId + `...WithUpdateLock`,
      updateStatus/assignee, advance read markers).
- [ ] `message.record.service.ts` (append, list by conversation + visibility,
      latest id).
- [ ] Integration schema-contract test for both tables.

## Core flow (R1, R5, R6, R7, R8)

- [ ] `conversation.service.ts`: `createConversation` (idempotent on `publicId`,
      transactional), `postCustomerReply`, `postAgentMessage` (PUBLIC/INTERNAL),
      `assign`, `setStatus` with transition rules + reopen-on-closed.
- [ ] Audit service + event constants; audit every state change.

## Access + rich text (R4, R14)

- [ ] `token/access-token.service.ts` (mint/hash/verify) + customer token guard.
- [ ] `richtext/richtext.render.ts` (TipTap JSON → sanitized HTML) + byte cap.

## Notifications (R10, R11)

- [ ] `notification/messaging.client.ts` (fire-and-forget POST to messaging).
- [ ] `conversation-notifier.service.ts`: notify-until-read decision (in-txn read
      of markers, post-commit delegate); assignment notification.
- [ ] **Messaging-side:** add the notification workflow + email template and the
      `MS_CONVERSATIONS`-equivalent app-source on messaging's endpoint.

## HTTP surface (R12, R13, R16)

- [ ] `conversation.controller.ts`: `POST /conversations` (create),
      agent list (filter assignee/status + unread), agent get (incl. INTERNAL),
      agent reply, assign, status.
- [ ] `conversation.customer.controller.ts`: token-authorized get (PUBLIC only),
      reply, read-mark.
- [ ] Wire `ConversationModule` into `AppModule` (already imported; fill it in).

## Tests

- [ ] Unit: service (idempotency, transitions, reopen), notify-until-read matrix,
      token, richtext sanitizer.
- [ ] E2E: create/idempotency, agent vs internal visibility, customer token
      paths, auth rejections.

## Out of scope (phase two — do not build)

Support-ticket type, tags/categories/departments, customer widget + "my tickets",
portal/JWT auth, participants table, SLA, French copy. See requirements R18.
