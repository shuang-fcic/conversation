import { Injectable, Logger } from '@nestjs/common';

import { ConversationAuditEvent } from 'src/conversation/audit/conversation-audit.constant';
import { ConversationAuditService } from 'src/conversation/audit/conversation-audit.service';
import { Conversation } from 'src/conversation/conversation.type';
import { AgentRecipient } from 'src/conversation/record/participant.record.service';

import { MessagingClient } from './messaging.client';
export type NotifyIntent = {
  kind: 'reply';
  conversation: Conversation;
  recipientRole: 'customer' | 'agent';
  recipients?: AgentRecipient[];
};
@Injectable()
export class ConversationNotifierService {
  private readonly logger = new Logger(ConversationNotifierService.name);
  constructor(
    private readonly messagingClient: MessagingClient,
    private readonly audit: ConversationAuditService,
  ) {}
  schedule(intent: NotifyIntent): void {
    void this.dispatch(intent).catch((err: unknown) =>
      this.logger.warn(
        { err, conversationPublicId: intent.conversation.publicId },
        'Notification dispatch failed (non-fatal)',
      ),
    );
  }
  private async dispatch(intent: NotifyIntent): Promise<void> {
    const { conversation } = intent;
    const recipients: Array<{ email: string; name: string }> =
      intent.recipientRole === 'customer'
        ? [
            {
              email: conversation.customerEmail,
              name: conversation.customerName,
            },
          ]
        : (intent.recipients ?? []);
    // Send separately so addresses stay private and one delivery failure cannot block others.
    const unique = [
      ...new Map(
        recipients.map((r) => [r.email.toLowerCase(), r] as const),
      ).values(),
    ];
    await Promise.all(
      unique.map(async (recipient) => {
        try {
          await this.messagingClient.notifyReply({
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            conversationPublicId: conversation.publicId,
            recipientRole: intent.recipientRole,
          });
          this.audit.record({
            event: ConversationAuditEvent.NOTIFICATION_DISPATCHED,
            conversationPublicId: conversation.publicId,
            meta: { kind: 'reply', recipientRole: intent.recipientRole },
          });
        } catch (err) {
          this.logger.warn(
            { err, conversationPublicId: conversation.publicId },
            'Reply notification failed (non-fatal)',
          );
        }
      }),
    );
  }
}
