import { Injectable, Logger } from '@nestjs/common';

import { ConversationAuditEvent } from './conversation-audit.constant';

export type AuditRecordParams = {
  event: ConversationAuditEvent;
  conversationPublicId: string;
  actor?: string | null;
  meta?: Record<string, unknown>;
};

@Injectable()
export class ConversationAuditService {
  private readonly logger = new Logger(ConversationAuditService.name);

  record(params: AuditRecordParams): void {
    this.logger.log(
      {
        auditEvent: params.event,
        conversationPublicId: params.conversationPublicId,
        actor: params.actor ?? null,
        ...params.meta,
      },
      `audit: ${params.event}`,
    );
  }
}
