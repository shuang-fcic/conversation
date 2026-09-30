import * as os from 'os';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createPool, Pool } from 'generic-pool';
import odbc from 'odbc';

import { CachingService } from 'src/caching/caching.service';

import { databaseConfig } from './database.config';
import { DB2_TIMEZONE_OFFSET_CACHE_KEY } from './database.constant';
import {
  DB2_HEALTH_CHANGED_EVENT,
  Db2HealthChangedEvent,
} from './database.event.constant';

type ConnectionConfig = Record<string, string | number | undefined>;

const PING_SQL = 'SELECT 1 FROM SYSIBM.SYSDUMMY1';

// Error reporting must not mask the original outage on circular values.
function describeError(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return '[unserializable error]';
  }
}

@Injectable()
export class Db2Repository implements OnModuleDestroy, OnModuleInit {
  private logger: Logger = new Logger(Db2Repository.name);
  private pool!: Pool<odbc.Connection>;
  private connectionString: string;

  // generic-pool has no success event; successful create and factoryCreateError
  // are edge-triggered through this state.
  private health: 'unknown' | 'up' | 'down' = 'unknown';

  constructor(
    private readonly caching: CachingService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(databaseConfig.KEY)
    private readonly config: ConfigType<typeof databaseConfig>,
  ) {
    this.connectionString = Db2Repository.buildConnectionString({
      ClientApplName: `MS-CONVERSATIONS-${os.hostname()}`,
      DRIVER: '{IBM i Access ODBC Driver}',
      TRIMCHAR: 1,
      CCSID: 1208,
      BLOCKSIZE: 8192,
      XDYNAMIC: 0,
      CMT: 1,
      SYSTEM: this.config.system,
      UID: this.config.uid,
      PWD: this.config.pwd,
      // Only integration tests set ConnectionType=2 (read-only).
      ConnectionType: this.config.connectionType,
    });
  }

  private static buildConnectionString(config: ConnectionConfig): string {
    return Object.entries(config)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${value};`)
      .join('');
  }

  async query<T>(
    sql: string,
    params: Array<string | number> = [],
    conn?: odbc.Connection,
  ): Promise<T[]> {
    const connection = conn || (await this.pool.acquire());
    try {
      const result = await connection.query<T>(sql, params);
      return Array.from(result);
    } catch (error) {
      this.logger.error({ sql, params, error }, 'Failed executing query');
      throw error;
    } finally {
      if (!conn) await this.pool.release(connection);
    }
  }

  async queryOne<T>(
    ...params: Parameters<typeof this.query>
  ): Promise<T | null> {
    const results = await this.query<T>(...params);
    return results.length > 0 ? results[0] : null;
  }

  async withTransaction<T>(
    callback: (conn: odbc.Connection) => Promise<T>,
    conn?: odbc.Connection,
  ): Promise<T> {
    if (conn) {
      return callback(conn);
    }

    const connection = await this.pool.acquire();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await this.pool.release(connection);
    }
  }

  /**
   * Converts UTC to DB2 server-local time because DB2 TIMESTAMP has no timezone.
   */
  async toDb2Timestamp(date: Date): Promise<string> {
    const timezoneOffset = await this.getTimezoneOffset();
    const localMs = date.getTime() + timezoneOffset;
    const local = new Date(localMs);

    return local.toISOString().replace('T', ' ').replace('Z', '');
  }

  /**
   * Converts a timezone-less DB2 server-local timestamp back to UTC.
   */
  async fromDb2Timestamp(timestamp: string): Promise<Date> {
    const timezoneOffset = await this.getTimezoneOffset();
    const asUtc = new Date(timestamp.trim().replace(' ', 'T') + 'Z');

    return new Date(asUtc.getTime() - timezoneOffset);
  }

  /**
   * Returns false without logging; dependency outages are data in the health response.
   */
  async isConnected(): Promise<boolean> {
    let connection: odbc.Connection | undefined;
    try {
      connection = await this.pool.acquire();
      await connection.query(PING_SQL);
      return true;
    } catch {
      return false;
    } finally {
      if (connection) await this.pool.release(connection);
    }
  }

  onModuleInit() {
    this.pool = createPool(
      {
        create: async () => {
          const conn = await odbc.connect(this.connectionString);
          this.reportHealth('up');
          return conn;
        },
        destroy: (conn) => conn.close(),
        validate: (conn) =>
          conn
            .query(PING_SQL)
            .then(() => true)
            .catch(() => false),
      },
      {
        min: 2,
        max: 10,
        testOnBorrow: true,
        acquireTimeoutMillis: 5000,
        idleTimeoutMillis: 60000 * 30,
        evictionRunIntervalMillis: 60000 * 30,
      },
    );

    this.pool.on('factoryCreateError', (error: unknown) =>
      this.reportHealth('down', error),
    );
  }

  /**
   * Emits only reachability edges; factoryCreateError can fire on every retry.
   */
  private reportHealth(status: 'up' | 'down', error?: unknown): void {
    if (this.health === status) return;
    this.health = status;

    if (status === 'down') {
      this.logger.error({ error }, 'DB2 connection pool unavailable');
    } else {
      this.logger.log({}, 'DB2 connection pool reachable');
    }

    this.eventEmitter.emit(DB2_HEALTH_CHANGED_EVENT, {
      status,
      error: describeError(error),
    } satisfies Db2HealthChangedEvent);
  }

  /**
   * Fetches lazily so a startup DB2 blip does not crash the service. Never
   * defaults to UTC because a wrong offset would silently corrupt timestamps.
   */
  private getTimezoneOffset(): Promise<number> {
    return this.caching.withCache({
      key: DB2_TIMEZONE_OFFSET_CACHE_KEY,
      fn: () => this.fetchTimezoneOffset(),
      ttl: this.config.timezoneOffsetTtlMs,
    });
  }

  private async fetchTimezoneOffset(): Promise<number> {
    const row = await this.queryOne<{ TZ: number }>(
      'SELECT CURRENT TIMEZONE AS TZ FROM SYSIBM.SYSDUMMY1',
    );

    if (!row) {
      throw new Error('Failed to retrieve DB2 timezone offset');
    }

    const tz = row.TZ;
    const sign = tz < 0 ? -1 : 1;
    const abs = Math.abs(tz);
    const hours = Math.floor(abs / 10000);
    const minutes = Math.floor((abs % 10000) / 100);
    const seconds = abs % 100;

    const utcOffsetMs = sign * ((hours * 3600 + minutes * 60 + seconds) * 1000);

    const offsetHours = utcOffsetMs / (1000 * 60 * 60);
    this.logger.log(
      { utcOffsetMs, utcOffsetHours: offsetHours },
      `DB2 server timezone offset: ${offsetHours >= 0 ? '+' : ''}${offsetHours}h`,
    );

    return utcOffsetMs;
  }

  async onModuleDestroy() {
    await this.pool.drain();
    await this.pool.clear();
  }
}
