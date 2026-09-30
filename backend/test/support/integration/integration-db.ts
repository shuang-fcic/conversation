import { createMock } from '@golevelup/ts-jest';
import { type ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { CachingService } from 'src/caching/caching.service';
import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';

type DatabaseConfig = ConfigType<typeof databaseConfig>;

export function isIntegrationConfigured(): boolean {
  return Boolean(
    process.env.DB2_TEST_SYSTEM &&
    process.env.DB2_TEST_UID &&
    process.env.DB2_TEST_PWD &&
    process.env.DB2_TEST_SCHEMA,
  );
}

export const describeIntegration = isIntegrationConfigured()
  ? describe
  : describe.skip;

function testDatabaseConfig(): DatabaseConfig {
  return {
    system: process.env.DB2_TEST_SYSTEM as string,
    uid: process.env.DB2_TEST_UID as string,
    pwd: process.env.DB2_TEST_PWD as string,
    schema: process.env.DB2_TEST_SCHEMA as string,
    timezoneOffsetTtlMs: 3600000,
    // Defense in depth alongside the recommended SELECT-only DB user.
    connectionType: 2,
  };
}

export interface IntegrationDb {
  db2: Db2Repository;
  config: DatabaseConfig;
  close: () => Promise<void>;
}

/** Boots a real read-only repository and exposes a lifecycle-aware close function. */
export async function createIntegrationDb(): Promise<IntegrationDb> {
  const config = testDatabaseConfig();

  const caching = createMock<CachingService>();
  caching.withCache.mockImplementation(({ fn }) => Promise.resolve(fn()));

  const moduleRef = await Test.createTestingModule({
    providers: [
      Db2Repository,
      { provide: CachingService, useValue: caching },
      { provide: EventEmitter2, useValue: createMock<EventEmitter2>() },
      { provide: databaseConfig.KEY, useValue: config },
    ],
  }).compile();

  await moduleRef.init();

  return {
    db2: moduleRef.get(Db2Repository),
    config,
    close: () => moduleRef.close(),
  };
}
