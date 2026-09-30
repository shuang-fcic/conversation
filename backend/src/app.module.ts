import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AlertingModule } from './alerting/alerting.module';
import { Db2AlertSubscriber } from './alerting/server/db2-alert.subscriber';
import { LifecycleAlertSubscriber } from './alerting/server/lifecycle-alert.subscriber';
import { RmqAlertSubscriber } from './alerting/server/rmq-alert.subscriber';
import { UnhandledExceptionAlertFilter } from './alerting/server/unhandled-exception.filter';
import { CachingModule } from './caching/caching.module';
import { appConfig } from './common/config/app.config';
import { throttlerConfig } from './common/config/throttler.config';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { CONFIG_MODULE_OPTIONS } from './common/setup/config-module.options';
import { buildLoggerConfig } from './common/setup/logger.options';
import { ConversationModule } from './conversation/conversation.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RmqModule } from './rmq/rmq.module';

@Module({
  imports: [
    ConfigModule.forRoot(CONFIG_MODULE_OPTIONS),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) => buildLoggerConfig(app),
    }),
    ThrottlerModule.forRootAsync({
      inject: [throttlerConfig.KEY],
      useFactory: (config: ConfigType<typeof throttlerConfig>) => ({
        throttlers: [
          {
            name: 'global',
            ttl: config.global.span,
            limit: config.global.limit,
          },
        ],
      }),
    }),
    CachingModule,
    AlertingModule,
    ConversationModule,
    DatabaseModule,
    RmqModule,
    HealthModule,
    EventEmitterModule.forRoot(),
  ],
  // The alerting subscribers/filter are wired here (server-only) rather than in
  // AlertingModule, so the CLI/cron — which load AlertingModule for DI — never fire them.
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_FILTER, useClass: UnhandledExceptionAlertFilter },
    LifecycleAlertSubscriber,
    RmqAlertSubscriber,
    Db2AlertSubscriber,
  ],
})
export class AppModule {}
