import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Cache } from 'cache-manager';

import { CacheSetParams, WithCacheParams } from './caching.type';

@Injectable()
export class CachingService {
  private readonly logger = new Logger(CachingService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly invalidatedInFlight = new Set<string>();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Get-or-set. Cache faults fall through to `fn` rather than throwing;
   * `null`/`undefined` are not cached. Concurrent misses for the same key
   * share one in-flight fetch instead of each issuing a redundant call.
   */
  async withCache<T>(params: WithCacheParams<T>): Promise<T> {
    const { key, fn, ttl } = params;
    try {
      const hit = await this.cache.get<T>(key);
      if (hit !== null && hit !== undefined) {
        return hit;
      }
    } catch (error) {
      this.logger.error(
        { cacheKey: key, error },
        'Cache read failed; falling through to source',
      );
      return await fn();
    }

    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    // Register synchronously so another miss joins this fetch before it awaits.
    const pending = this.load(key, fn, ttl);
    this.inFlight.set(key, pending);
    return pending;
  }

  private async load<T>(
    key: string,
    fn: () => Promise<T> | T,
    ttl?: number,
  ): Promise<T> {
    try {
      const value = await fn();
      // A del() during this load means our value may predate the mutation that
      // triggered it; skip the write so eviction wins and the next read refetches.
      const invalidated = this.invalidatedInFlight.has(key);
      if (value !== null && value !== undefined && !invalidated) {
        void this.set({ key, value, ttl });
      }
      return value;
    } finally {
      this.inFlight.delete(key);
      this.invalidatedInFlight.delete(key);
    }
  }

  private async set<T>(params: CacheSetParams<T>): Promise<void> {
    const { key, value, ttl } = params;
    try {
      await this.cache.set(key, value, ttl);
    } catch (error) {
      this.logger.error({ cacheKey: key, error }, 'Cache write failed');
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      if (this.inFlight.has(k)) this.invalidatedInFlight.add(k);
    }
    try {
      if (Array.isArray(key)) {
        await this.cache.mdel(key);
      } else {
        await this.cache.del(key);
      }
    } catch (error) {
      this.logger.error({ cacheKey: key, error }, 'Cache delete failed');
    }
  }

  async clear(): Promise<void> {
    try {
      await this.cache.clear();
    } catch (error) {
      this.logger.error({ error }, 'Cache clear failed');
    }
  }
}
