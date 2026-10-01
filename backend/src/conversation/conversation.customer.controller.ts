import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, Min, IsNotEmpty, IsObject } from 'class-validator';

import { ConversationNotFoundError } from './conversation.error';
import { ConversationService } from './conversation.service';
import { renderToHtml } from './richtext/richtext.render';
import type { CustomerRequest } from './token/access-token.guard';
import { AccessTokenGuard } from './token/access-token.guard';

class PostCustomerMessageDto {
  @IsObject()
  @IsNotEmpty()
  bodyJson!: Record<string, unknown>;
}

class MarkReadDto {
  @IsInt()
  @Min(1)
  messageId!: number;
}

/**
 * Token-authorized customer endpoints (R13, R5, R9).
 * All routes require `x-conversation-token` header (validated by AccessTokenGuard).
 * Never returns INTERNAL messages.
 */
@Controller('conversations/customer')
@UseGuards(AccessTokenGuard)
export class ConversationCustomerController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  async get(@Req() req: any) {
    const customerReq = req as CustomerRequest;
    const result = await this.conversationService.getForCustomer(
      customerReq.conversation,
    );
    return {
      conversation: {
        publicId: result.conversation.publicId,
        type: result.conversation.type,
        subject: result.conversation.subject,
        status: result.conversation.status,
        waitingOn: result.conversation.waitingOn,
        customerName: result.conversation.customerName,
        hasUnreadForCustomer: result.conversation.hasUnreadForCustomer,
        updatedAt: result.conversation.updatedAt,
        createdAt: result.conversation.createdAt,
      },
      messages: result.messages.map((m) => ({
        id: m.id,
        authorType: m.authorType,
        visibility: m.visibility,
        bodyJson: m.bodyJson,
        bodyHtml: renderToHtml(m.bodyJson),
        createdAt: m.createdAt,
      })),
    };
  }

  @Post('messages')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async postMessage(@Req() req: any, @Body() dto: PostCustomerMessageDto) {
    const customerReq = req as CustomerRequest;
    try {
      const msg = await this.conversationService.postCustomerReply({
        conversationPublicId: customerReq.conversation.publicId,
        bodyJson: dto.bodyJson,
      });
      return {
        id: msg.id,
        authorType: msg.authorType,
        bodyJson: msg.bodyJson,
        bodyHtml: renderToHtml(msg.bodyJson),
        createdAt: msg.createdAt,
      };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }

  @Put('read-marker')
  async markRead(@Req() req: any, @Body() dto: MarkReadDto) {
    const customerReq = req as CustomerRequest;
    try {
      await this.conversationService.markCustomerRead({
        conversationPublicId: customerReq.conversation.publicId,
        messageId: dto.messageId,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }
}
