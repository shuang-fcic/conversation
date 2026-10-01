# Design — Shared conversations

## Ownership and contracts

The service is domain agnostic. Messaging authors the quote snapshot and context; rcNext displays it and decides which authenticated users are agents. Future rcNext allocation rules are not a conversation-service ownership model.

- Create: `POST /conversations` from `ms-messaging`, with `{ publicId, type, subject, customerName, customerEmail, externalRef?, context?, openingMessage? }`. Response `{ publicId, accessToken, type, status, createdAt }`.
- Agent: `GET /conversations?status`, `GET /conversations/:publicId`, `POST /conversations/:publicId/messages` with `{ bodyJson, visibility, authorEmail, authorName }`, `PATCH /conversations/:publicId/status`, `PUT /conversations/:publicId/read-marker` with numeric `messageId`. App source `rc-next`; authenticated viewer/author in `x-user-id`. No assignee routes or filters.
- Customer: existing `/conversations/customer` GET, `/messages` POST and `/read-marker` PUT use `x-conversation-token`. Only PUBLIC messages are returned.
- Notifications: `MessagingClient` calls messaging `POST /messages`, app source `ms-conversations`, workflow `conversation-reply`; one `{ recipientEmail, recipientName, conversationPublicId, recipientRole }` payload per recipient. Delivery is failure-isolated and bounded by a 15-second timeout, with no automatic HTTP retry. Messaging owns send policy and audit of provider delivery.

## Storage and concurrency

`CONVERSATION` holds shared status/customer data, opaque externalRef and `CONTEXT_JSON` (a bounded map of strings). There are no quote-specific columns. `MESSAGE` contains immutable rich-text posts. `CONVERSATION_AGENT` has a composite key `(CONVERSATION_ID, AGENT_ID)`, verified email/name, SUBSCRIBED and LAST_READ_MESSAGE_ID. Reading creates a nonsubscriber; public replying subscribes; internal-only authors stay nonsubscribers. Contact data is refreshed on replies.

All participant mutations and reply decisions hold the parent conversation row lock. Agent read-marker MERGE keeps the maximum valid same-thread message ID; customer cursors additionally require PUBLIC visibility. Each agent’s unread flag is computed from PUBLIC CUSTOMER messages beyond their own cursor. Customer unread considers PUBLIC AGENT messages only. SYSTEM and INTERNAL messages cannot cause customer unread notifications.

Customer replies snapshot all subscribed, caught-up agents inside the transaction. Dispatch happens after commit. The notifier deduplicates addresses and catches each recipient failure separately. No creation/view/assignment notification exists. Public agent replies preserve customer notify-until-read semantics. Successful dispatch is audited; process termination can lose an in-flight notification because this iteration has no durable outbox.

## Rendering and components

`ConversationService` coordinates record services, access tokens and audit. `ParticipantRecordService` owns agent participation; `ConversationRecordService` owns thread state. Controllers validate context size and session-derived agent contact fields. `renderToHtml` returns escaped, whitelist-only bodyHtml alongside bodyJson; rendering tolerates malformed nodes and caps nesting. Customer projection omits context, agent authorId/authorName, participant contact, tokens and INTERNAL messages. Agent message projections include authorId and authorName for internal attribution.

## Provisioning and verification

`schema/msconv.ddl.sql` describes fresh installs; `schema/shared-agent-queue.migration.sql` upgrades existing installs. Schema descriptors and read-only integration checks track the new table. Retain unused legacy assignment columns during rollout; do not copy the shared old read cursor into individual agents. Existing PUBLIC authors are migrated as subscribers without guessed emails; they become deliverable after rcNext supplies verified contact on a subsequent reply. No live migration was executed locally.

Deploy migration/journaling first, then compatible backend services and rcNext. Configure CONVERSATION_MESSAGING_BASE_URL and provision messaging’s conv-reply template. Unit tests cover generic creation, fan-out eligibility, independent read cursors, internal-note privacy, renderer behavior and notification failures. Live DB2/provider checks remain an environment validation step.
