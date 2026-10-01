import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  IsInt,
  Min,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { Response } from 'express';

import { APP_SOURCE } from 'src/auth/constants/auth.app-source.constant';
import { AllowedAppSources } from 'src/auth/decorators/auth.internal-service.controller.decorator';
import { UserId } from 'src/auth/decorators/auth.internal-service.param.decorator';
import { InternalServiceAuthGuard } from 'src/auth/guards/auth.internal-service-auth.guard';

import { ConversationNotFoundError } from './conversation.error';
import { ConversationService } from './conversation.service';
import {
  AuthorType,
  ConversationStatus,
  ConversationType,
  MessageVisibility,
} from './conversation.type';
import { renderToHtml } from './richtext/richtext.render';

// ---- Request DTOs ----

class OpeningMessageDto {
  @IsObject()
  @IsNotEmpty()
  bodyJson!: Record<string, unknown>;

  @IsEnum(AuthorType)
  authorType!: AuthorType;

  @IsString()
  @IsOptional()
  authorId?: string;
}

class CreateConversationDto {
  @IsUUID()
  publicId!: string;

  @IsEnum(ConversationType)
  type!: ConversationType;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  customerName!: string;

  @IsEmail()
  customerEmail!: string;

  @IsString()
  @IsOptional()
  externalRef?: string;

  @IsObject()
  @IsOptional()
  context?: Record<string, string>;

  @ValidateNested()
  @Type(() => OpeningMessageDto)
  @IsOptional()
  openingMessage?: OpeningMessageDto;
}

class PostAgentMessageDto {
  @IsEmail()
  authorEmail!: string;

  @IsString()
  @MaxLength(255)
  authorName!: string;

  @IsObject()
  @IsNotEmpty()
  bodyJson!: Record<string, unknown>;

  @IsEnum(MessageVisibility)
  visibility!: MessageVisibility;
}

class SetStatusDto {
  @IsEnum(ConversationStatus)
  status!: ConversationStatus;
}

class MarkReadDto {
  @IsInt()
  @Min(1)
  messageId!: number;
}

class ListQueryDto {
  @IsEnum(ConversationStatus)
  @IsOptional()
  status?: ConversationStatus;
}

// ---- Controller ----

@Controller('conversations')
@UseGuards(InternalServiceAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @AllowedAppSources(APP_SOURCE.MS_MESSAGING)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async create(
    @Body() dto: CreateConversationDto,
    @UserId() userId: string | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      dto.context &&
      (Object.keys(dto.context).length > 20 ||
        Object.entries(dto.context).some(
          ([key, value]) =>
            key.length > 80 || typeof value !== 'string' || value.length > 255,
        ))
    )
      throw new BadRequestException(
        'Context must contain at most 20 string values (255 characters each)',
      );
    const result = await this.conversationService.createConversation({
      publicId: dto.publicId,
      type: dto.type,
      subject: dto.subject,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      externalRef: dto.externalRef ?? null,
      context: dto.context,
      openingMessage: dto.openingMessage
        ? {
            bodyJson: dto.openingMessage.bodyJson,
            authorType: dto.openingMessage.authorType,
            authorId: dto.openingMessage.authorId ?? null,
          }
        : undefined,
      createdBy: userId,
    });

    res.status(result.isNew ? HttpStatus.CREATED : HttpStatus.OK);

    return {
      publicId: result.conversation.publicId,
      accessToken: result.conversation.accessToken,
      type: result.conversation.type,
      status: result.conversation.status,
      createdAt: result.conversation.createdAt,
    };
  }

  @Get()
  @AllowedAppSources(APP_SOURCE.RC_NEXT)
  async list(@Query() query: ListQueryDto, @UserId() userId: string | null) {
    const conversations = await this.conversationService.listForAgent({
      agentId: userId ?? undefined,
      status: query.status,
    });
    return conversations.map((c) => ({
      publicId: c.publicId,
      type: c.type,
      subject: c.subject,
      status: c.status,
      waitingOn: c.waitingOn,
      context: c.context,
      customerName: c.customerName,
      customerEmail: c.customerEmail,
      externalRef: c.externalRef,
      hasUnreadForAgent: c.hasUnreadForAgent,
      hasUnreadForCustomer: c.hasUnreadForCustomer,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
    }));
  }

  @Get(':publicId')
  @AllowedAppSources(APP_SOURCE.RC_NEXT)
  async get(
    @Param('publicId') publicId: string,
    @UserId() userId: string | null,
  ) {
    try {
      const result = await this.conversationService.getForAgent(
        publicId,
        userId ?? undefined,
      );
      return {
        conversation: {
          publicId: result.conversation.publicId,
          type: result.conversation.type,
          subject: result.conversation.subject,
          status: result.conversation.status,
          waitingOn: result.conversation.waitingOn,
          context: result.conversation.context,
          customerName: result.conversation.customerName,
          customerEmail: result.conversation.customerEmail,
          externalRef: result.conversation.externalRef,
          hasUnreadForAgent: result.conversation.hasUnreadForAgent,
          hasUnreadForCustomer: result.conversation.hasUnreadForCustomer,
          updatedAt: result.conversation.updatedAt,
          createdAt: result.conversation.createdAt,
        },
        messages: result.messages.map((m) => ({
          id: m.id,
          authorType: m.authorType,
          authorName: m.authorName,
          authorId: m.authorId,
          bodyJson: m.bodyJson,
          bodyHtml: renderToHtml(m.bodyJson),
          visibility: m.visibility,
          createdAt: m.createdAt,
        })),
      };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }

  @Post(':publicId/messages')
  @AllowedAppSources(APP_SOURCE.RC_NEXT)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async postMessage(
    @Param('publicId') publicId: string,
    @Body() dto: PostAgentMessageDto,
    @UserId() userId: string | null,
  ) {
    try {
      if (!userId) throw new BadRequestException('Missing agent identity');
      const msg = await this.conversationService.postAgentMessage({
        conversationPublicId: publicId,
        bodyJson: dto.bodyJson,
        visibility: dto.visibility,
        authorId: userId,
        authorEmail: dto.authorEmail,
        authorName: dto.authorName,
        createdBy: userId,
      });
      return {
        id: msg.id,
        authorType: msg.authorType,
        authorName: msg.authorName,
        authorId: msg.authorId,
        bodyJson: msg.bodyJson,
        bodyHtml: renderToHtml(msg.bodyJson),
        visibility: msg.visibility,
        createdAt: msg.createdAt,
      };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }

  @Patch(':publicId/status')
  @AllowedAppSources(APP_SOURCE.RC_NEXT)
  async setStatus(
    @Param('publicId') publicId: string,
    @Body() dto: SetStatusDto,
    @UserId() userId: string | null,
  ) {
    try {
      const conv = await this.conversationService.setStatus({
        conversationPublicId: publicId,
        status: dto.status,
        updatedBy: userId,
      });
      return { publicId: conv.publicId, status: conv.status };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }

  @Put(':publicId/read-marker')
  @AllowedAppSources(APP_SOURCE.RC_NEXT)
  async markRead(
    @Param('publicId') publicId: string,
    @Body() dto: MarkReadDto,
    @UserId() userId: string | null,
  ) {
    try {
      if (!userId) throw new BadRequestException('Missing agent identity');
      await this.conversationService.markAgentRead({
        conversationPublicId: publicId,
        messageId: dto.messageId,
        updatedBy: userId,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof ConversationNotFoundError)
        throw new NotFoundException();
      throw err;
    }
  }
}
