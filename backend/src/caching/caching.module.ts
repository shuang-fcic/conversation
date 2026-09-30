import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { cachingConfig } from './caching.config';
import { CachingService } from './caching.service';

// This cache and its evictions are per-instance; callers must tolerate one TTL
// of cross-instance staleness.
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      inject: [cachingConfig.KEY],
      useFactory: (config: ConfigType<typeof cachingConfig>) => ({
        ttl: config.tiers.DEFAULT,
      }),
    }),
  ],
  providers: [CachingService],
  exports: [CachingService],
})
export class CachingModule {}
