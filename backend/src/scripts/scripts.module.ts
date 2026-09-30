import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AlertingModule } from 'src/alerting/alerting.module';
import { CachingModule } from 'src/caching/caching.module';
import { CONFIG_MODULE_OPTIONS } from 'src/common/setup/config-module.options';
import { DatabaseModule } from 'src/database/database.module';
import { RmqModule } from 'src/rmq/rmq.module';

import { DbPingCommand } from './commands/db-ping.command';
import { PromptService } from './prompt.service';

// Do not add LoggerModule: concurrent CLI and server pino-roll writers corrupt rotation.
@Module({
  imports: [
    ConfigModule.forRoot(CONFIG_MODULE_OPTIONS),
    EventEmitterModule.forRoot(),
    AlertingModule,
    CachingModule,
    DatabaseModule,
    RmqModule,
  ],
  providers: [PromptService, DbPingCommand],
})
export class ScriptsModule {}
