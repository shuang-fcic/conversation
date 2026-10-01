import { createMock } from '@golevelup/ts-jest';

import { stubTransaction } from '@test/support/helpers/db2.helper';
import { Db2Repository } from 'src/database/database.db2.repository';

import { ConversationAuditService } from './audit/conversation-audit.service';
import { ConversationNotFoundError } from './conversation.error';
import { ConversationService } from './conversation.service';
import {
  AuthorType,
  Conversation,
  ConversationStatus,
  ConversationType,
  MessageVisibility,
  WaitingOn,
  Message,
} from './conversation.type';
import { ConversationNotifierService } from './notification/conversation-notifier.service';
import { ConversationRecordService } from './record/conversation.record.service';
import { MessageRecordService } from './record/message.record.service';
import { ParticipantRecordService } from './record/participant.record.service';
import { AccessTokenService } from './token/access-token.service';

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 1,
    publicId: 'conv-pub-1',
    type: ConversationType.VIRTUAL_AGENT_QUOTE,
    subject: 'Test quote',
    status: ConversationStatus.OPEN,
    waitingOn: null,
    customerName: 'Alice',
    customerEmail: 'alice@example.com',
    externalRef: null,
    context: {},
    accessToken: 'access-token-uuid',
    latestMessageId: null,
    customerLastReadMessageId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 10,
    conversationId: 1,
    authorType: AuthorType.CUSTOMER,
    authorId: null,
    bodyJson: { type: 'doc', content: [] },
    visibility: MessageVisibility.PUBLIC,
    createdAt: new Date('2026-01-01'),
    createdBy: null,
    ...overrides,
  };
}

describe('ConversationService', () => {
  let service: ConversationService;
  let db2: jest.Mocked<Db2Repository>;
  let conversationRecord: jest.Mocked<ConversationRecordService>;
  let messageRecord: jest.Mocked<MessageRecordService>;
  let accessTokenService: jest.Mocked<AccessTokenService>;
  let audit: jest.Mocked<ConversationAuditService>;
  let notifier: jest.Mocked<ConversationNotifierService>;

  let participants: jest.Mocked<ParticipantRecordService>;
  beforeEach(() => {
    participants = createMock<ParticipantRecordService>();
    participants.subscribers.mockResolvedValue([
      {
        agentId: 'agent-1',
        email: 'agent@example.com',
        name: 'Agent',
        lastReadId: 4,
      },
    ]);
    participants.lastRead.mockResolvedValue(null);
    db2 = createMock<Db2Repository>();
    conversationRecord = createMock<ConversationRecordService>();
    messageRecord = createMock<MessageRecordService>();
    messageRecord.hasUnread.mockResolvedValue(false);
    accessTokenService = createMock<AccessTokenService>();
    audit = createMock<ConversationAuditService>();
    notifier = createMock<ConversationNotifierService>();

    service = new ConversationService(
      db2,
      conversationRecord,
      messageRecord,
      accessTokenService,
      audit,
      notifier,
      participants,
    );

    stubTransaction(db2);
  });

  // ---- createConversation ----

  describe('createConversation', () => {
    it('creates a new conversation and returns isNew=true', async () => {
      const conv = makeConversation();
      conversationRecord.findByPublicId.mockResolvedValue(null);
      accessTokenService.mint.mockReturnValue('new-token');
      conversationRecord.create.mockResolvedValue(conv);

      const result = await service.createConversation({
        publicId: 'conv-pub-1',
        type: ConversationType.VIRTUAL_AGENT_QUOTE,
        subject: 'Test',
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
      });

      expect(result.isNew).toBe(true);
      expect(conversationRecord.create).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it('returns existing conversation with isNew=false on duplicate publicId', async () => {
      const existing = makeConversation();
      conversationRecord.findByPublicId.mockResolvedValue(existing);

      const result = await service.createConversation({
        publicId: 'conv-pub-1',
        type: ConversationType.VIRTUAL_AGENT_QUOTE,
        subject: 'Test',
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
      });

      expect(result.isNew).toBe(false);
      expect(result.conversation).toBe(existing);
      expect(conversationRecord.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ConversationType.VIRTUAL_AGENT_QUOTE,
      ConversationType.SUPPORT_TICKET,
    ])('appends a generic opening record for %s', async (type) => {
      const conv = makeConversation();
      conversationRecord.findByPublicId.mockResolvedValue(null);
      accessTokenService.mint.mockReturnValue('tok');
      conversationRecord.create.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.createConversation({
        publicId: 'conv-pub-1',
        type,
        subject: 'Test',
        customerName: 'Alice',
        customerEmail: 'alice@example.com',
        openingMessage: {
          bodyJson: { type: 'doc', content: [] },
          authorType: AuthorType.SYSTEM,
        },
      });

      expect(messageRecord.append).toHaveBeenCalledTimes(1);
      expect(conversationRecord.updateAfterMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('shared participation', () => {
    it('creation never notifies an agent', async () => {
      conversationRecord.findByPublicId.mockResolvedValue(null);
      conversationRecord.create.mockResolvedValue(makeConversation());
      await service.createConversation({
        publicId: 'new',
        type: ConversationType.SUPPORT_TICKET,
        subject: 'Help',
        customerName: 'A',
        customerEmail: 'a@example.com',
      });
      expect(notifier.schedule).not.toHaveBeenCalled();
    });
    it('notifies all caught-up public responders but not another unread responder', async () => {
      participants.subscribers.mockResolvedValue([
        { agentId: 'a', email: 'a@example.com', name: 'A', lastReadId: 4 },
        { agentId: 'b', email: 'b@example.com', name: 'B', lastReadId: 4 },
        { agentId: 'c', email: 'c@example.com', name: 'C', lastReadId: 1 },
      ]);
      messageRecord.hasUnread
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(
        makeConversation(),
      );
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      await service.postCustomerReply({
        conversationPublicId: 'pub',
        bodyJson: { type: 'doc' },
      });
      expect(notifier.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [
            expect.objectContaining({ agentId: 'a' }),
            expect.objectContaining({ agentId: 'b' }),
          ],
        }),
      );
    });
    it('does not notify when nobody has publicly replied', async () => {
      participants.subscribers.mockResolvedValue([]);
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(
        makeConversation(),
      );
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      await service.postCustomerReply({
        conversationPublicId: 'pub',
        bodyJson: { type: 'doc' },
      });
      expect(notifier.schedule).not.toHaveBeenCalled();
    });
    it('reads the requesting agent cursor without an ownership filter', async () => {
      conversationRecord.findMany.mockResolvedValue([makeConversation()]);
      participants.lastRead.mockResolvedValue(7);
      await service.listForAgent({ agentId: 'agent-b' });
      expect(participants.lastRead).toHaveBeenCalledWith({
        conversationId: 1,
        agentId: 'agent-b',
      });
      expect(messageRecord.hasUnread).toHaveBeenCalledWith(
        expect.objectContaining({
          lastReadId: 7,
          authorType: AuthorType.CUSTOMER,
        }),
      );
    });
  });

  // ---- postCustomerReply ----

  describe('postCustomerReply', () => {
    it('appends a PUBLIC CUSTOMER message', async () => {
      const conv = makeConversation({
        latestMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      const msg = makeMessage({ id: 5 });
      messageRecord.append.mockResolvedValue(msg);
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      const result = await service.postCustomerReply({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
      });

      expect(result).toBe(msg);
      expect(messageRecord.append).toHaveBeenCalledWith(
        expect.objectContaining({
          authorType: AuthorType.CUSTOMER,
          visibility: MessageVisibility.PUBLIC,
        }),
        expect.anything(),
      );
    });

    it('schedules notification when participating agent was caught up', async () => {
      const conv = makeConversation({
        latestMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postCustomerReply({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
      });

      expect(notifier.schedule).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'reply', recipientRole: 'agent' }),
      );
    });

    it('does NOT schedule notification when participating agent has unread messages', async () => {
      messageRecord.hasUnread.mockResolvedValue(true);
      const conv = makeConversation({
        latestMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postCustomerReply({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
      });

      expect(notifier.schedule).not.toHaveBeenCalled();
    });

    it('reopens a RESOLVED conversation', async () => {
      const conv = makeConversation({
        status: ConversationStatus.RESOLVED,
        latestMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postCustomerReply({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
      });

      expect(conversationRecord.updateAfterMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: ConversationStatus.OPEN }),
        expect.anything(),
      );
    });

    it('reopens a CLOSED conversation', async () => {
      const conv = makeConversation({
        status: ConversationStatus.CLOSED,
        latestMessageId: null,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postCustomerReply({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
      });

      expect(conversationRecord.updateAfterMessage).toHaveBeenCalledWith(
        expect.objectContaining({ status: ConversationStatus.OPEN }),
        expect.anything(),
      );
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(null);

      await expect(
        service.postCustomerReply({
          conversationPublicId: 'missing',
          bodyJson: { type: 'doc', content: [] },
        }),
      ).rejects.toBeInstanceOf(ConversationNotFoundError);
    });
  });

  // ---- postAgentMessage ----

  describe('postAgentMessage', () => {
    it('moves status to PENDING on PUBLIC reply', async () => {
      const conv = makeConversation({
        latestMessageId: 4,
        customerLastReadMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(makeMessage({ id: 5 }));
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postAgentMessage({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
        visibility: MessageVisibility.PUBLIC,
        authorId: 'agent-1',
        authorEmail: 'agent@example.com',
        authorName: 'Agent',
      });

      expect(conversationRecord.updateAfterMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ConversationStatus.PENDING,
          waitingOn: WaitingOn.CUSTOMER,
        }),
        expect.anything(),
      );
    });

    it('does NOT change status for INTERNAL note', async () => {
      const conv = makeConversation({ latestMessageId: 4 });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(
        makeMessage({ id: 5, visibility: MessageVisibility.INTERNAL }),
      );
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postAgentMessage({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
        visibility: MessageVisibility.INTERNAL,
        authorId: 'agent-1',
        authorEmail: 'agent@example.com',
        authorName: 'Agent',
      });

      expect(conversationRecord.updateAfterMessage).toHaveBeenCalledWith(
        expect.not.objectContaining({ status: expect.anything() }),
        expect.anything(),
      );
    });

    it('does NOT notify customer for INTERNAL note', async () => {
      const conv = makeConversation({
        latestMessageId: 4,
        customerLastReadMessageId: 4,
      });
      conversationRecord.findByPublicIdWithLock.mockResolvedValue(conv);
      messageRecord.append.mockResolvedValue(
        makeMessage({ id: 5, visibility: MessageVisibility.INTERNAL }),
      );
      conversationRecord.updateAfterMessage.mockResolvedValue(undefined);

      await service.postAgentMessage({
        conversationPublicId: 'conv-pub-1',
        bodyJson: { type: 'doc', content: [] },
        visibility: MessageVisibility.INTERNAL,
        authorId: 'agent-1',
        authorEmail: 'agent@example.com',
        authorName: 'Agent',
      });

      expect(notifier.schedule).not.toHaveBeenCalled();
    });
  });

  // ---- listForAgent / toView ----

  describe('listForAgent', () => {
    it('computes hasUnreadForAgent correctly', async () => {
      const withUnread = makeConversation({
        latestMessageId: 5,
      });
      const caughtUp = makeConversation({
        publicId: 'c2',
        latestMessageId: 5,
      });
      conversationRecord.findMany.mockResolvedValue([withUnread, caughtUp]);

      messageRecord.hasUnread
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      const results = await service.listForAgent({});

      expect(results[0].hasUnreadForAgent).toBe(true);
      expect(results[1].hasUnreadForAgent).toBe(false);
    });
  });
});
