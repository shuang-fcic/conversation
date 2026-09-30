import { Module } from '@nestjs/common';

// Domain skeleton. The Conversation + Message engine (records, controller,
// service, tokenized access, notify-until-read) is defined by the
// specs/virtual-agent-quote feature spec and built on top of this module.
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ConversationModule {}
