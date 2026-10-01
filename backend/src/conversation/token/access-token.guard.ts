import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { Conversation } from 'src/conversation/conversation.type';
import { ConversationRecordService } from 'src/conversation/record/conversation.record.service';

export interface CustomerRequest extends Request {
  conversation: Conversation;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly conversationRecord: ConversationRecordService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CustomerRequest>();
    const token = req.headers['x-conversation-token'] as string | undefined;

    if (!token) {
      // Uniform rejection — no information leak (R4.3)
      throw new UnauthorizedException('Missing or invalid conversation token.');
    }

    const conversation = await this.conversationRecord.findByAccessToken(token);
    if (!conversation) {
      throw new UnauthorizedException('Missing or invalid conversation token.');
    }

    req.conversation = conversation;
    return true;
  }
}
