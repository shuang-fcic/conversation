import { Injectable, Logger } from '@nestjs/common';

import { Db2Repository } from 'src/database/database.db2.repository';

import { ConversationAuditEvent } from './audit/conversation-audit.constant';
import { ConversationAuditService } from './audit/conversation-audit.service';
import {
  ConversationNotFoundError,
  InvalidAccessTokenError,
} from './conversation.error';
import {
  AuthorType,
  Conversation,
  ConversationStatus,
  ConversationView,
  CreateConversationParams,
  ListConversationsParams,
  MarkReadParams,
  Message,
  MessageVisibility,
  PostAgentMessageParams,
  PostCustomerReplyParams,
  SetStatusParams,
  WaitingOn,
} from './conversation.type';
import {
  NotifyIntent,
  ConversationNotifierService,
} from './notification/conversation-notifier.service';
import { ConversationRecordService } from './record/conversation.record.service';
import { MessageRecordService } from './record/message.record.service';
import {
  AgentRecipient,
  ParticipantRecordService,
} from './record/participant.record.service';
import { assertBodySize } from './richtext/richtext.render';
import { AccessTokenService } from './token/access-token.service';

export type CreateConversationResult = {
  conversation: Conversation;
  isNew: boolean;
};

export type ConversationWithMessages = {
  conversation: ConversationView;
  messages: Message[];
};

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly db2: Db2Repository,
    private readonly conversationRecord: ConversationRecordService,
    private readonly messageRecord: MessageRecordService,
    private readonly accessTokenService: AccessTokenService,
    private readonly audit: ConversationAuditService,
    private readonly notifier: ConversationNotifierService,
    private readonly participants: ParticipantRecordService,
  ) {}

  // ---- Create (R1, R2) ----

  async createConversation(
    params: CreateConversationParams,
  ): Promise<CreateConversationResult> {
    let isNew = false;

    const conversation = await this.db2.withTransaction(async (conn) => {
      // Fast-path idempotency check — most retries hit this branch.
      const existing = await this.conversationRecord.findByPublicId(
        params.publicId,
        conn,
      );
      if (existing) {
        this.logger.log(
          { conversationPublicId: params.publicId },
          'createConversation: returning existing (idempotent)',
        );
        return existing;
      }

      isNew = true;
      const accessToken = this.accessTokenService.mint();

      const conv = await this.conversationRecord.create(
        {
          publicId: params.publicId,
          type: params.type,
          subject: params.subject,
          status: ConversationStatus.OPEN,
          waitingOn: null,
          customerName: params.customerName,
          customerEmail: params.customerEmail,
          externalRef: params.externalRef ?? null,
          context: params.context ?? {},
          accessToken,
          createdBy: params.createdBy ?? null,
        },
        conn,
      );

      if (params.openingMessage) {
        assertBodySize(params.openingMessage.bodyJson);
        const msg = await this.messageRecord.append(
          {
            conversationId: conv.id,
            authorType: params.openingMessage.authorType,
            authorId: params.openingMessage.authorId ?? null,
            bodyJson: params.openingMessage.bodyJson,
            visibility: MessageVisibility.PUBLIC,
            createdBy: params.createdBy ?? null,
          },
          conn,
        );
        await this.conversationRecord.updateAfterMessage(
          {
            id: conv.id,
            latestMessageId: msg.id,
            updatedBy: params.createdBy ?? null,
          },
          conn,
        );
      }

      this.audit.record({
        event: ConversationAuditEvent.CREATED,
        conversationPublicId: conv.publicId,
        actor: params.createdBy,
        meta: { type: conv.type },
      });

      return conv;
    });

    return { conversation, isNew };
  }

  // ---- Customer reply (R5) ----

  async postCustomerReply(params: PostCustomerReplyParams): Promise<Message> {
    assertBodySize(params.bodyJson);

    let notifyIntent: NotifyIntent | null = null;

    const message = await this.db2.withTransaction(async (conn) => {
      const conv = await this.conversationRecord.findByPublicIdWithLock(
        params.conversationPublicId,
        conn,
      );
      if (!conv)
        throw new ConversationNotFoundError(params.conversationPublicId);

      const recipients = await this.participants.subscribers(conv.id, conn);
      const caughtUp: AgentRecipient[] = [];
      for (const recipient of recipients) {
        if (
          !(await this.messageRecord.hasUnread(
            {
              conversationId: conv.id,
              authorType: AuthorType.CUSTOMER,
              lastReadId: recipient.lastReadId,
            },
            conn,
          ))
        )
          caughtUp.push(recipient);
      }

      const msg = await this.messageRecord.append(
        {
          conversationId: conv.id,
          authorType: AuthorType.CUSTOMER,
          authorId: null,
          bodyJson: params.bodyJson,
          visibility: MessageVisibility.PUBLIC,
          createdBy: null,
        },
        conn,
      );

      const nextStatus = this.reopenOrPending(conv.status);
      await this.conversationRecord.updateAfterMessage(
        {
          id: conv.id,
          latestMessageId: msg.id,
          customerLastReadMessageId: msg.id, // author is caught up on their own post
          status: nextStatus,
          waitingOn: WaitingOn.AGENT,
          updatedBy: null,
        },
        conn,
      );

      this.audit.record({
        event: ConversationAuditEvent.MESSAGE_POSTED,
        conversationPublicId: conv.publicId,
        meta: {
          authorType: AuthorType.CUSTOMER,
          visibility: MessageVisibility.PUBLIC,
        },
      });

      if (caughtUp.length) {
        notifyIntent = {
          kind: 'reply',
          conversation: { ...conv, latestMessageId: msg.id },
          recipientRole: 'agent',
          recipients: caughtUp,
        };
      }

      return msg;
    });

    if (notifyIntent) this.notifier.schedule(notifyIntent);

    return message;
  }

  // ---- Agent message (R6) ----

  async postAgentMessage(params: PostAgentMessageParams): Promise<Message> {
    assertBodySize(params.bodyJson);

    let notifyIntent: NotifyIntent | null = null;

    const message = await this.db2.withTransaction(async (conn) => {
      const conv = await this.conversationRecord.findByPublicIdWithLock(
        params.conversationPublicId,
        conn,
      );
      if (!conv)
        throw new ConversationNotFoundError(params.conversationPublicId);

      const isPublic = params.visibility === MessageVisibility.PUBLIC;

      // Notify-until-read decision for public replies only (R6.2).
      let wasCaughtUp = false;
      if (isPublic) {
        wasCaughtUp = !(await this.messageRecord.hasUnread(
          {
            conversationId: conv.id,
            authorType: AuthorType.AGENT,
            lastReadId: conv.customerLastReadMessageId,
          },
          conn,
        ));
      }

      const msg = await this.messageRecord.append(
        {
          conversationId: conv.id,
          authorType: AuthorType.AGENT,
          authorId: params.authorId,
          bodyJson: params.bodyJson,
          visibility: params.visibility,
          createdBy: params.createdBy ?? null,
        },
        conn,
      );

      await this.participants.recordReply(
        {
          conversationId: conv.id,
          agentId: params.authorId,
          email: params.authorEmail,
          name: params.authorName,
          messageId: msg.id,
          subscribe: isPublic,
        },
        conn,
      );

      if (isPublic) {
        const nextStatus = this.reopenOrPending(conv.status);
        await this.conversationRecord.updateAfterMessage(
          {
            id: conv.id,
            latestMessageId: msg.id,
            status: nextStatus,
            waitingOn: WaitingOn.CUSTOMER,
            updatedBy: params.createdBy ?? null,
          },
          conn,
        );

        if (wasCaughtUp) {
          notifyIntent = {
            kind: 'reply',
            conversation: { ...conv, latestMessageId: msg.id },
            recipientRole: 'customer',
          };
        }
      } else {
        // INTERNAL note: update latest message id only, no status change (R6.2)
        await this.conversationRecord.updateAfterMessage(
          {
            id: conv.id,
            latestMessageId: msg.id,
            updatedBy: params.createdBy ?? null,
          },
          conn,
        );
      }

      this.audit.record({
        event: ConversationAuditEvent.MESSAGE_POSTED,
        conversationPublicId: conv.publicId,
        actor: params.authorId,
        meta: { authorType: AuthorType.AGENT, visibility: params.visibility },
      });

      return { ...msg, authorName: params.authorName };
    });

    if (notifyIntent) this.notifier.schedule(notifyIntent);

    return message;
  }

  // ---- Status (R8) ----

  async setStatus(params: SetStatusParams): Promise<Conversation> {
    return this.db2.withTransaction(async (conn) => {
      const conv = await this.conversationRecord.findByPublicIdWithLock(
        params.conversationPublicId,
        conn,
      );
      if (!conv)
        throw new ConversationNotFoundError(params.conversationPublicId);

      await this.conversationRecord.updateStatus(
        {
          id: conv.id,
          status: params.status,
          waitingOn: null,
          updatedBy: params.updatedBy ?? null,
        },
        conn,
      );

      this.audit.record({
        event: ConversationAuditEvent.STATUS_CHANGED,
        conversationPublicId: conv.publicId,
        actor: params.updatedBy,
        meta: { from: conv.status, to: params.status },
      });

      return { ...conv, status: params.status, waitingOn: null };
    });
  }

  // ---- Read tracking (R9) ----

  async markCustomerRead(params: MarkReadParams): Promise<void> {
    await this.db2.withTransaction(async (conn) => {
      const conv = await this.conversationRecord.findByPublicIdWithLock(
        params.conversationPublicId,
        conn,
      );
      if (!conv)
        throw new ConversationNotFoundError(params.conversationPublicId);

      await this.conversationRecord.advanceReadMarker(
        {
          id: conv.id,
          side: 'CUSTOMER',
          messageId: params.messageId,
          updatedBy: params.updatedBy ?? null,
        },
        conn,
      );

      this.audit.record({
        event: ConversationAuditEvent.READ_MARKED,
        conversationPublicId: conv.publicId,
        meta: { side: 'CUSTOMER', messageId: params.messageId },
      });
    });
  }

  async markAgentRead(params: MarkReadParams): Promise<void> {
    await this.db2.withTransaction(async (conn) => {
      const conv = await this.conversationRecord.findByPublicIdWithLock(
        params.conversationPublicId,
        conn,
      );
      if (!conv)
        throw new ConversationNotFoundError(params.conversationPublicId);

      await this.participants.markRead(
        {
          conversationId: conv.id,
          agentId: params.updatedBy!,
          messageId: params.messageId,
        },
        conn,
      );

      this.audit.record({
        event: ConversationAuditEvent.READ_MARKED,
        conversationPublicId: conv.publicId,
        actor: params.updatedBy,
        meta: { side: 'AGENT', messageId: params.messageId },
      });
    });
  }

  // ---- Query (R12, R13) ----

  async listForAgent(
    params: ListConversationsParams,
  ): Promise<ConversationView[]> {
    const conversations = await this.conversationRecord.findMany(params);
    return Promise.all(
      conversations.map((c) => this.toView(c, params.agentId)),
    );
  }

  async getForAgent(
    publicId: string,
    agentId?: string,
  ): Promise<ConversationWithMessages> {
    const [conv, messages] = await Promise.all([
      this.conversationRecord.findByPublicId(publicId),
      (async () => {
        const c = await this.conversationRecord.findByPublicId(publicId);
        if (!c) return [];
        return this.messageRecord.listByConversation({ conversationId: c.id });
      })(),
    ]);

    if (!conv) throw new ConversationNotFoundError(publicId);

    return { conversation: await this.toView(conv, agentId), messages };
  }

  async getForCustomer(
    conversation: Conversation,
  ): Promise<ConversationWithMessages> {
    const messages = await this.messageRecord.listByConversation({
      conversationId: conversation.id,
      visibilities: [MessageVisibility.PUBLIC],
    });
    return { conversation: await this.toView(conversation), messages };
  }

  async findByAccessToken(token: string): Promise<Conversation> {
    const conv = await this.conversationRecord.findByAccessToken(token);
    if (!conv) throw new InvalidAccessTokenError();
    return conv;
  }

  // ---- Helpers ----

  private async toView(
    c: Conversation,
    agentId?: string,
  ): Promise<ConversationView> {
    const lastReadId = agentId
      ? await this.participants.lastRead({ conversationId: c.id, agentId })
      : null;
    const [hasUnreadForAgent, hasUnreadForCustomer] = await Promise.all([
      this.messageRecord.hasUnread({
        conversationId: c.id,
        authorType: AuthorType.CUSTOMER,
        lastReadId,
      }),
      this.messageRecord.hasUnread({
        conversationId: c.id,
        authorType: AuthorType.AGENT,
        lastReadId: c.customerLastReadMessageId,
      }),
    ]);
    return { ...c, hasUnreadForAgent, hasUnreadForCustomer };
  }

  /**
   * A reply to RESOLVED/CLOSED reopens to OPEN (R8.3); otherwise move to PENDING.
   */
  private reopenOrPending(current: ConversationStatus): ConversationStatus {
    if (
      current === ConversationStatus.RESOLVED ||
      current === ConversationStatus.CLOSED
    ) {
      return ConversationStatus.OPEN;
    }
    return ConversationStatus.PENDING;
  }
}
