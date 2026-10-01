import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { conversationConfig } from 'src/conversation/conversation.config';
export type NotifyReplyParams = {
  recipientEmail: string;
  recipientName: string;
  conversationPublicId: string;
  recipientRole: 'customer' | 'agent';
};
@Injectable()
export class MessagingClient {
  constructor(
    @Inject(conversationConfig.KEY)
    private readonly config: ConfigType<typeof conversationConfig>,
  ) {}
  async notifyReply(params: NotifyReplyParams): Promise<void> {
    if (!this.config.messagingBaseUrl)
      throw new Error(
        'CONVERSATION_MESSAGING_BASE_URL is required for notifications',
      );
    const response = await fetch(
      `${this.config.messagingBaseUrl.replace(/\/$/, '')}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-source': 'ms-conversations',
        },
        body: JSON.stringify({
          workflowName: 'conversation-reply',
          data: params,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(`Reply notification rejected: ${response.status}`);
  }
}
