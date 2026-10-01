import { Module } from '@nestjs/common';

import { AuthModule } from 'src/auth/auth.module';

import { ConversationAuditService } from './audit/conversation-audit.service';
import { ConversationController } from './conversation.controller';
import { ConversationCustomerController } from './conversation.customer.controller';
import { ConversationService } from './conversation.service';
import { ConversationNotifierService } from './notification/conversation-notifier.service';
import { MessagingClient } from './notification/messaging.client';
import { ConversationRecordService } from './record/conversation.record.service';
import { MessageRecordService } from './record/message.record.service';
import { ParticipantRecordService } from './record/participant.record.service';
import { AccessTokenGuard } from './token/access-token.guard';
import { AccessTokenService } from './token/access-token.service';

@Module({
  imports: [AuthModule],
  controllers: [ConversationCustomerController, ConversationController],
  providers: [
    ConversationService,
    ConversationRecordService,
    ParticipantRecordService,
    MessageRecordService,
    ConversationAuditService,
    AccessTokenService,
    AccessTokenGuard,
    ConversationNotifierService,
    MessagingClient,
  ],
  exports: [],
})
export class ConversationModule {}
