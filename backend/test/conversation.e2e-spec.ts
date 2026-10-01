import { HttpStatus, INestApplication } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';
import request from 'supertest';

import { APP_SOURCE } from 'src/auth/constants/auth.app-source.constant';
import { InternalServiceAuthGuard } from 'src/auth/guards/auth.internal-service-auth.guard';
import { ConversationNotFoundError } from 'src/conversation/conversation.error';
import {
  AuthorType,
  ConversationStatus,
  ConversationType,
  MessageVisibility,
} from 'src/conversation/conversation.type';
import { ConversationController } from 'src/conversation/conversation.controller';
import { ConversationCustomerController } from 'src/conversation/conversation.customer.controller';
import { ConversationService } from 'src/conversation/conversation.service';
import { ConversationRecordService } from 'src/conversation/record/conversation.record.service';
import { AccessTokenGuard } from 'src/conversation/token/access-token.guard';

import { createTestApp } from './support/test-app';

const CONV_PUBLIC_ID = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';
const ACCESS_TOKEN = 'tok-uuid-v4-customer';

function makeConversation(overrides = {}) {
  return {
    id: 1,
    publicId: CONV_PUBLIC_ID,
    type: ConversationType.VIRTUAL_AGENT_QUOTE,
    subject: 'Quote #123',
    status: ConversationStatus.OPEN,
    waitingOn: null,
    customerName: 'Alice',
    customerEmail: 'alice@example.com',
    externalRef: 'ref-123',
    context: { dealNumber: 'D-1', dealerRef: '68200', dealerName: 'Westside' },
    accessToken: ACCESS_TOKEN,
    latestMessageId: null,
    customerLastReadMessageId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  };
}

describe('ConversationController (e2e)', () => {
  let app: INestApplication;
  let conversationService: jest.Mocked<ConversationService>;
  let conversationRecord: jest.Mocked<ConversationRecordService>;

  beforeAll(async () => {
    conversationService = createMock<ConversationService>();
    conversationRecord = createMock<ConversationRecordService>();

    app = await createTestApp({
      controllers: [ConversationCustomerController, ConversationController],
      providers: [
        InternalServiceAuthGuard,
        AccessTokenGuard,
        { provide: ConversationService, useValue: conversationService },
        { provide: ConversationRecordService, useValue: conversationRecord },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---- POST /conversations ----

  describe('POST /conversations', () => {
    const createBody = {
      publicId: CONV_PUBLIC_ID,
      type: ConversationType.VIRTUAL_AGENT_QUOTE,
      subject: 'Quote #123',
      customerName: 'Alice',
      customerEmail: 'alice@example.com',
    };

    it('returns 401 when x-app-source is missing', () => {
      return request(app.getHttpServer())
        .post('/conversations')
        .send(createBody)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 when x-app-source is not ms-messaging', () => {
      return request(app.getHttpServer())
        .post('/conversations')
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .send(createBody)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 400 when body is invalid (missing required field)', () => {
      return request(app.getHttpServer())
        .post('/conversations')
        .set('x-app-source', APP_SOURCE.MS_MESSAGING)
        .send({ publicId: CONV_PUBLIC_ID })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('returns 201 for a new conversation', async () => {
      const conv = makeConversation();
      conversationService.createConversation.mockResolvedValue({
        conversation: conv,
        isNew: true,
      });

      const res = await request(app.getHttpServer())
        .post('/conversations')
        .set('x-app-source', APP_SOURCE.MS_MESSAGING)
        .send(createBody)
        .expect(HttpStatus.CREATED);

      expect(res.body.publicId).toBe(CONV_PUBLIC_ID);
      expect(res.body.accessToken).toBe(ACCESS_TOKEN);
    });

    it('returns 200 for an idempotent replay (existing conversation)', async () => {
      const conv = makeConversation();
      conversationService.createConversation.mockResolvedValue({
        conversation: conv,
        isNew: false,
      });

      await request(app.getHttpServer())
        .post('/conversations')
        .set('x-app-source', APP_SOURCE.MS_MESSAGING)
        .send(createBody)
        .expect(HttpStatus.OK);
    });
  });

  // ---- GET /conversations ----

  describe('GET /conversations', () => {
    it('returns 401 without rc-next app-source', () => {
      return request(app.getHttpServer())
        .get('/conversations')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns list for authenticated agent', async () => {
      const conv = makeConversation();
      conversationService.listForAgent.mockResolvedValue([
        { ...conv, hasUnreadForAgent: true, hasUnreadForCustomer: false },
      ]);

      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .expect(HttpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].publicId).toBe(CONV_PUBLIC_ID);
      expect(res.body[0].hasUnreadForAgent).toBe(true);
    });
  });

  // ---- GET /conversations/:publicId ----

  describe('GET /conversations/:publicId', () => {
    it('returns 404 when conversation does not exist', async () => {
      conversationService.getForAgent.mockRejectedValue(
        new ConversationNotFoundError(CONV_PUBLIC_ID),
      );

      return request(app.getHttpServer())
        .get(`/conversations/${CONV_PUBLIC_ID}`)
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('includes INTERNAL messages in agent view', async () => {
      const conv = makeConversation();
      conversationService.getForAgent.mockResolvedValue({
        conversation: {
          ...conv,
          hasUnreadForAgent: false,
          hasUnreadForCustomer: false,
        },
        messages: [
          {
            id: 1,
            conversationId: 1,
            authorType: AuthorType.AGENT,
            authorId: 'agent-1',
            authorName: 'Jordan Lee',
            bodyJson: { type: 'doc', content: [] },
            visibility: MessageVisibility.INTERNAL,
            createdAt: new Date('2026-01-01'),
            createdBy: 'agent-1',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/conversations/${CONV_PUBLIC_ID}`)
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .expect(HttpStatus.OK);

      const msg = res.body.messages[0];
      expect(msg.visibility).toBe(MessageVisibility.INTERNAL);
    });
  });

  describe('shared agent contract', () => {
    it('does not expose an assignment mutation', () =>
      request(app.getHttpServer())
        .put(`/conversations/${CONV_PUBLIC_ID}/assignee`)
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .send({ assigneeId: 'agent-2' })
        .expect(404));
    it('rejects a reply without authenticated identity or contact', () =>
      request(app.getHttpServer())
        .post(`/conversations/${CONV_PUBLIC_ID}/messages`)
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .send({ bodyJson: { type: 'doc' }, visibility: 'PUBLIC' })
        .expect(400));
    it('passes verified contact and identity for participant registration', async () => {
      conversationService.postAgentMessage.mockResolvedValue({
        id: 9,
        conversationId: 1,
        authorType: AuthorType.AGENT,
        authorId: 'agent-2',
        authorName: 'Jordan Lee',
        bodyJson: { type: 'doc' },
        visibility: MessageVisibility.PUBLIC,
        createdAt: new Date('2026-01-01'),
        createdBy: 'agent-2',
      });
      await request(app.getHttpServer())
        .post(`/conversations/${CONV_PUBLIC_ID}/messages`)
        .set('x-app-source', APP_SOURCE.RC_NEXT)
        .set('x-user-id', 'agent-2')
        .send({
          bodyJson: { type: 'doc' },
          visibility: 'PUBLIC',
          authorEmail: 'jordan@example.com',
          authorName: 'Jordan Lee',
        })
        .expect(201);
      expect(conversationService.postAgentMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'agent-2',
          authorEmail: 'jordan@example.com',
          authorName: 'Jordan Lee',
        }),
      );
    });
    it('rejects non-string context entries', () =>
      request(app.getHttpServer())
        .post('/conversations')
        .set('x-app-source', APP_SOURCE.MS_MESSAGING)
        .send({
          publicId: CONV_PUBLIC_ID,
          type: 'SUPPORT_TICKET',
          subject: 'Help',
          customerName: 'A',
          customerEmail: 'a@example.com',
          context: { nested: { id: 'x' } },
        })
        .expect(400));
  });

  // ---- Customer endpoints ----

  describe('GET /conversations/customer', () => {
    it('returns 401 without x-conversation-token', () => {
      return request(app.getHttpServer())
        .get('/conversations/customer')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 401 with an invalid token', async () => {
      conversationRecord.findByAccessToken.mockResolvedValue(null);

      return request(app.getHttpServer())
        .get('/conversations/customer')
        .set('x-conversation-token', 'bad-token')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns only PUBLIC messages for customer', async () => {
      const conv = makeConversation();
      conversationRecord.findByAccessToken.mockResolvedValue(conv);
      conversationService.getForCustomer.mockResolvedValue({
        conversation: {
          ...conv,
          hasUnreadForAgent: false,
          hasUnreadForCustomer: false,
        },
        messages: [
          {
            id: 2,
            conversationId: 1,
            authorType: AuthorType.AGENT,
            authorId: 'agent-1',
            authorName: 'Jordan Lee',
            bodyJson: { type: 'doc', content: [] },
            visibility: MessageVisibility.PUBLIC,
            createdAt: new Date('2026-01-01'),
            createdBy: 'agent-1',
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/conversations/customer')
        .set('x-conversation-token', ACCESS_TOKEN)
        .expect(HttpStatus.OK);

      expect(res.body.messages.length).toBe(1);
      // authorId must not be exposed on customer view
      expect(res.body.messages[0].authorId).toBeUndefined();
      expect(res.body.messages[0].authorName).toBeUndefined();
    });
  });

  describe('POST /conversations/customer/messages', () => {
    it('returns 401 without token', () => {
      return request(app.getHttpServer())
        .post('/conversations/customer/messages')
        .send({ bodyJson: { type: 'doc', content: [] } })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('posts a reply and returns the message', async () => {
      const conv = makeConversation();
      conversationRecord.findByAccessToken.mockResolvedValue(conv);
      conversationService.postCustomerReply.mockResolvedValue({
        id: 10,
        conversationId: 1,
        authorType: AuthorType.CUSTOMER,
        authorId: null,
        bodyJson: { type: 'doc', content: [] },
        visibility: MessageVisibility.PUBLIC,
        createdAt: new Date('2026-01-01'),
        createdBy: null,
      });

      const res = await request(app.getHttpServer())
        .post('/conversations/customer/messages')
        .set('x-conversation-token', ACCESS_TOKEN)
        .send({ bodyJson: { type: 'doc', content: [] } })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBe(10);
      expect(res.body.authorType).toBe(AuthorType.CUSTOMER);
    });
  });
});
