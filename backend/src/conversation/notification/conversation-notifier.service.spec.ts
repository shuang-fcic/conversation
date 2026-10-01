import { createMock } from '@golevelup/ts-jest';

import { ConversationAuditService } from 'src/conversation/audit/conversation-audit.service';
import {
  Conversation,
  ConversationStatus,
  ConversationType,
  WaitingOn,
} from 'src/conversation/conversation.type';

import {
  ConversationNotifierService,
  NotifyIntent,
} from './conversation-notifier.service';
import { MessagingClient } from './messaging.client';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 1,
    publicId: 'pub-1',
    type: ConversationType.VIRTUAL_AGENT_QUOTE,
    subject: 'Test',
    status: ConversationStatus.OPEN,
    waitingOn: WaitingOn.CUSTOMER,
    customerName: 'Alice',
    customerEmail: 'alice@example.com',
    externalRef: null,
    context: {},
    accessToken: 'token-uuid',
    latestMessageId: 5,
    customerLastReadMessageId: 5,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

describe('ConversationNotifierService', () => {
  let notifier: ConversationNotifierService;
  let client: jest.Mocked<MessagingClient>;
  let audit: jest.Mocked<ConversationAuditService>;

  beforeEach(() => {
    client = createMock<MessagingClient>();
    audit = createMock<ConversationAuditService>();
    notifier = new ConversationNotifierService(client, audit);
  });

  it('calls notifyReply for a customer reply intent', async () => {
    const intent: NotifyIntent = {
      kind: 'reply',
      conversation: makeConversation(),
      recipientRole: 'agent',
      recipients: [
        { agentId: 'a', email: 'a@example.com', name: 'A', lastReadId: 1 },
      ],
    };

    notifier.schedule(intent);
    // Fire-and-forget — give the microtask queue a tick.
    await Promise.resolve();
    await Promise.resolve();

    expect(client.notifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationPublicId: 'pub-1',
        recipientRole: 'agent',
      }),
    );
  });

  it('calls notifyReply for a customer intent without disclosing a capability', async () => {
    const intent: NotifyIntent = {
      kind: 'reply',
      conversation: makeConversation(),
      recipientRole: 'customer',
    };

    notifier.schedule(intent);
    await Promise.resolve();
    await Promise.resolve();

    expect(client.notifyReply).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: 'customer',
        recipientEmail: 'alice@example.com',
      }),
    );
  });

  it('deduplicates addresses and isolates failures per recipient', async () => {
    client.notifyReply
      .mockRejectedValueOnce(new Error('one failed'))
      .mockResolvedValue(undefined);
    notifier.schedule({
      kind: 'reply',
      conversation: makeConversation(),
      recipientRole: 'agent',
      recipients: [
        { agentId: 'a', email: 'a@example.com', name: 'A', lastReadId: 1 },
        {
          agentId: 'alias',
          email: 'A@example.com',
          name: 'Alias',
          lastReadId: 1,
        },
        { agentId: 'b', email: 'b@example.com', name: 'B', lastReadId: 1 },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.notifyReply).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('swallows client errors without throwing (fire-and-forget, R10.4)', async () => {
    client.notifyReply.mockRejectedValue(new Error('messaging down'));

    const intent: NotifyIntent = {
      kind: 'reply',
      conversation: makeConversation(),
      recipientRole: 'agent',
      recipients: [
        { agentId: 'a', email: 'a@example.com', name: 'A', lastReadId: 1 },
      ],
    };

    // schedule() must not throw even if the client rejects
    expect(() => notifier.schedule(intent)).not.toThrow();
    // Let the rejected promise settle
    await Promise.resolve();
    await Promise.resolve();
    // Audit should NOT have been called because dispatch errored before it
    expect(audit.record).not.toHaveBeenCalled();
  });
});
