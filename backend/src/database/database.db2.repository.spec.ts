import { createMock } from '@golevelup/ts-jest';
import { type ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CachingService } from 'src/caching/caching.service';

import { databaseConfig } from './database.config';
import { Db2Repository } from './database.db2.repository';

// NB: in production this module imports the native `odbc` addon (which needs
// unixODBC). In Jest, `odbc` is mapped to a stub via `moduleNameMapper`, so these
// tests never load the native addon — and they never open the pool regardless.

const HOUR_MS = 60 * 60 * 1000;

describe('Db2Repository timestamp conversions', () => {
  let caching: jest.Mocked<CachingService>;
  let repo: Db2Repository;

  function withServerOffset(ms: number) {
    caching.withCache.mockResolvedValue(ms);
  }

  beforeEach(() => {
    caching = createMock<CachingService>();
    const config = {
      system: 'sys',
      uid: 'u',
      pwd: 'p',
      schema: 'MSMSG',
      timezoneOffsetTtlMs: 3600000,
    } as ConfigType<typeof databaseConfig>;

    repo = new Db2Repository(caching, createMock<EventEmitter2>(), config);
  });

  describe('toDb2Timestamp (UTC Date -> server-local string)', () => {
    it('shifts a UTC instant by a negative (behind-UTC) server offset', async () => {
      withServerOffset(-5 * HOUR_MS);
      const out = await repo.toDb2Timestamp(
        new Date('2026-07-03T18:30:45.123Z'),
      );
      expect(out).toBe('2026-07-03 13:30:45.123');
    });

    it('shifts by a positive (ahead-of-UTC) server offset', async () => {
      withServerOffset(2 * HOUR_MS);
      const out = await repo.toDb2Timestamp(
        new Date('2026-07-03T22:00:00.000Z'),
      );
      expect(out).toBe('2026-07-04 00:00:00.000');
    });
  });

  describe('fromDb2Timestamp (server-local string -> UTC Date)', () => {
    it('reverses a negative server offset back to UTC', async () => {
      withServerOffset(-5 * HOUR_MS);
      const out = await repo.fromDb2Timestamp('2026-07-03 13:30:45.123');
      expect(out.toISOString()).toBe('2026-07-03T18:30:45.123Z');
    });

    it('tolerates surrounding whitespace', async () => {
      withServerOffset(-5 * HOUR_MS);
      const out = await repo.fromDb2Timestamp('  2026-07-03 13:30:45.123  ');
      expect(out.toISOString()).toBe('2026-07-03T18:30:45.123Z');
    });
  });

  it('round-trips a Date through both conversions', async () => {
    withServerOffset(-5 * HOUR_MS);
    const original = new Date('2026-12-25T09:15:30.000Z');
    const roundTripped = await repo.fromDb2Timestamp(
      await repo.toDb2Timestamp(original),
    );
    expect(roundTripped.getTime()).toBe(original.getTime());
  });
});
