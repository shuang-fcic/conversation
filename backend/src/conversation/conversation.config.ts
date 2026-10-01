import { registerAs } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';

export class ConversationEnv {
  @IsOptional()
  @IsString()
  CONVERSATION_MESSAGING_BASE_URL?: string;
}

export const conversationConfig = registerAs('conversation', () => ({
  messagingBaseUrl: process.env.CONVERSATION_MESSAGING_BASE_URL,
}));
