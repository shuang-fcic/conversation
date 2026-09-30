import { ConfigFactory, ConfigModuleOptions } from '@nestjs/config';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { alertingConfig, AlertingEnv } from 'src/alerting/alerting.config';
import { cachingConfig, CachingEnv } from 'src/caching/caching.config';
import { appConfig, AppEnv } from 'src/common/config/app.config';
import {
  throttlerConfig,
  ThrottlerEnv,
} from 'src/common/config/throttler.config';
import { cronConfig, CronEnv } from 'src/cron/cron.config';
import { databaseConfig, DatabaseEnv } from 'src/database/database.config';
import { rmqConfig, RmqEnv } from 'src/rmq/rmq.config';

// One registry drives both namespace loading and aggregate environment validation.
// Adding a namespace = write its *.config.ts (factory + Env DTO) + one line here.
const NAMESPACES: Array<{
  config: ConfigFactory;
  env: ClassConstructor<object>;
}> = [
  { config: appConfig, env: AppEnv },
  { config: databaseConfig, env: DatabaseEnv },
  { config: rmqConfig, env: RmqEnv },
  { config: cachingConfig, env: CachingEnv },
  { config: alertingConfig, env: AlertingEnv },
  { config: throttlerConfig, env: ThrottlerEnv },
  { config: cronConfig, env: CronEnv },
];

function validate(raw: Record<string, unknown>): Record<string, unknown> {
  // Docker commonly supplies optional variables as FOO=; class-validator does
  // not otherwise treat an empty string as absent for @IsOptional.
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== ''),
  );

  const errors = NAMESPACES.flatMap(({ env }) =>
    validateSync(plainToInstance(env, cleaned), {
      skipMissingProperties: false,
    }),
  );

  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return raw;
}

export const CONFIG_MODULE_OPTIONS: ConfigModuleOptions = {
  isGlobal: true,
  cache: true,
  load: NAMESPACES.map((n) => n.config),
  validate,
};
