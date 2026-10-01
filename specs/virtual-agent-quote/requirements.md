# Requirements — Shared conversations

Owner: ms-conversations. Current contract: 2026-10-01. This service owns generic thread state and participation. Messaging owns quote snapshots and email delivery; rcNext owns UI and agent authorization. Requirement IDs are retained; R7/R11 now specify the removal of assignment.

### R1 — Create a conversation

1. Accept a stable UUID publicId, type, subject, customer identity, optional externalRef, optional context and optional openingMessage. Create atomically and idempotently; return { publicId, accessToken, type, status, createdAt }, with 201 for new and 200 for existing. Creation sends no agent notification.

### R2 — Generic model and context

1. Own conversations, messages, customer tokens and agent participation. Support VIRTUAL_AGENT_QUOTE and SUPPORT_TICKET without quote-specific branching. context is caller-owned string metadata (up to 20 keys, keys <=80 characters, values <=255). Quote, deal and dealer semantics belong to messaging/rcNext; no dedicated quote columns.

### R3 — Messages

1. Store TipTap bodyJson, authorType CUSTOMER/AGENT/SYSTEM, optional authorId, PUBLIC/INTERNAL visibility, and creation time. System opening records are ordinary messages. Numeric message IDs are used throughout the API.

### R4 — Customer capability

1. Resolve x-conversation-token to exactly one conversation. Do not expose the token in agent list/detail or customer responses, logs, or notification payloads. rcNext proxies customer calls; no login is required for the tokenized customer surface.

### R5 — Customer replies

1. Append PUBLIC CUSTOMER messages under a conversation row lock. Set waitingOn=AGENT, update the customer read cursor, and apply R8. After commit notify eligible participating agents per R10; no participant means no agent email.

### R6 — Agent replies and internal notes

1. All rcNext-authorized agents may reply to any conversation. Require x-user-id and validated authorEmail/authorName supplied by rcNext from its authenticated session. A PUBLIC reply subscribes that agent and updates their contact details and independent read cursor. An INTERNAL note updates their contact/read state but does not subscribe a new agent, change waitingOn/status, or notify customers. Existing subscribers remain subscribed.

### R7 — Assignment is outside this service

1. Expose no assignment mutation, assignee field or assignee filter. Conversations are shared among agents authorized by rcNext. Any future work allocation belongs to rcNext and must not be treated as an implicit service access restriction.

### R8 — Status lifecycle

1. Support OPEN, PENDING, RESOLVED and CLOSED. Public replies reopen RESOLVED/CLOSED to OPEN; other public replies set PENDING. Customer replies wait on AGENT; agent public replies wait on CUSTOMER. Explicit status changes clear waitingOn.

### R9 — Independent read tracking

1. Keep a customer cursor and a separate cursor per (conversation, agentId). Reading by one agent must not clear another agent’s unread state or notification eligibility. Only advance to a message in that conversation; customer reads must point to PUBLIC messages. Older requests cannot move cursors backwards. Viewing alone never subscribes an agent.

### R10 — Reply notification fan-out

1. For a customer reply, notify each previously public-replying agent whose customer-message unread state was clear before this reply. Suppress repeats for that agent until they read/reply. Public agent replies notify the customer only on the transition to unread; internal/system messages do not count. Snapshot recipients while holding the conversation lock; dispatch only after commit. Send recipients individually, deduplicate email addresses and isolate failures. Notification failure never rolls back the posted message.

### R11 — No create-time or assignment notifications

1. Never notify agents merely because a conversation was created or viewed. There is no assignment notification. Participation comes from a public reply; legacy public responders may be imported, but user IDs must never be used as guessed email addresses.

### R12 — Shared agent views

1. GET /conversations lists the most recent 200 conversations for any authorized agent, optionally filtered by status. Return customerName/customerEmail, externalRef, context, status/waitingOn, timestamps and per-requesting-agent unread state. GET /conversations/:publicId includes PUBLIC and INTERNAL messages. x-user-id identifies the viewer, not an owner filter.

### R13 — Customer view

1. Customer endpoints return PUBLIC messages only, without agent user IDs, names, emails, participant records or internal context metadata. Agent endpoints retain authorId and authorName for internal attribution. Server-rendered bodyHtml accompanies bodyJson. Customer responses never expose internal notes.

### R14 — Rich text

1. Allow text-only TipTap documents up to 100KB. Whitelist render to escaped HTML, including safe http/https/mailto links. Unknown/malformed nodes and excessive nesting cannot break thread reads. No attachments, images or embeds.

### R15 — Audit

1. Record creation, message posting, explicit status changes, read advances and successful notification dispatch with conversation correlation and actor where applicable. Never audit access tokens.

### R16 — Trust boundary

1. Require the existing internal app-source guard. ms-messaging creates conversations; rc-next lists/reads/posts/status/marks-read. rcNext owns user-level authorization and forwards authenticated user identity/contact. Customer capability endpoints use token validation. The service does not resolve the rc user directory.

### R17 — Outbound messaging contract

1. POST {CONVERSATION_MESSAGING_BASE_URL}/messages with x-app-source: ms-conversations, workflowName=conversation-reply and data={recipientEmail,recipientName,conversationPublicId,recipientRole}. No message bodies, private notes or tokens cross this notification contract. Messaging owns templates, suppression, rate limits and delivery tracking.

### R18 — Boundaries and deployment

1. No assignment, SLA, attachments or live socket transport in this iteration. Provision context storage and per-agent participation using the supplied DB2 migration and journal the new table before deployment. Existing quote bodies are not backfilled. Historical subscribers require verified contact data on their next reply before they can receive notifications; independent cursors start unread.
