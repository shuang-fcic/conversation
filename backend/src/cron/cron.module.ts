import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';

import { AlertingModule } from 'src/alerting/alerting.module';
import { CachingModule } from 'src/caching/caching.module';
import { appConfig } from 'src/common/config/app.config';
import { CONFIG_MODULE_OPTIONS } from 'src/common/setup/config-module.options';
import { buildCronLoggerConfig } from 'src/common/setup/logger.options';
import { cronConfig } from 'src/cron/cron.config';
import { getJobName, getRunId } from 'src/cron/cron.run.util';
import { DatabaseModule } from 'src/database/database.module';
import { RmqModule } from 'src/rmq/rmq.module';

import { ExampleSweepCommand } from './commands/example-sweep.command';
import { getCommandName, validateCronJobs } from './cron.jobs.util';

@Module({
  imports: [
    DiscoveryModule,
    ConfigModule.forRoot(CONFIG_MODULE_OPTIONS),
    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (app: ConfigType<typeof appConfig>) =>
        buildCronLoggerConfig(app, { job: getJobName(), runId: getRunId() }),
    }),
    EventEmitterModule.forRoot(),
    AlertingModule,
    CachingModule,
    DatabaseModule,
    RmqModule,
  ],
  providers: [ExampleSweepCommand],
})
export class CronModule implements OnModuleInit {
  constructor(
    @Inject(cronConfig.KEY)
    private readonly config: ConfigType<typeof cronConfig>,
    private readonly discovery: DiscoveryService,
  ) {}

  onModuleInit() {
    const registered = new Set(
      this.discovery
        .getProviders()
        .map((wrapper) => getCommandName(wrapper.metatype))
        .filter((name): name is string => !!name),
    );

    // A broken reflection key (e.g. after a nest-commander upgrade) would leave
    // this empty and make every allowlisted job look "unknown" — fail loudly on
    // the real cause instead.
    if (registered.size === 0) {
      throw new Error(
        'No @Command providers discovered — nest-commander metadata key may have changed',
      );
    }

    validateCronJobs(this.config.jobs, registered);
  }
}
