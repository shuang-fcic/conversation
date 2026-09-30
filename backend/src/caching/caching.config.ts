import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class CachingEnv {
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  CACHE_DEFAULT_TTL_MS?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  CACHE_LONG_TTL_MS?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  CACHE_LONGER_TTL_MS?: number;
}

const ttl = (value: string | undefined, fallback: number): number =>
  value ? Number(value) : fallback;

// Named TTL tiers so callers pick a cache lifetime by intent rather than each
// feature growing its own env var. The store is in-memory and per-instance, so
// a stale entry lives at most one tier's TTL.
//   DEFAULT — general/volatile (1 min)
//   LONG    — rarely-changed reference data, e.g. the email address book (1 h)
//   LONGER  — stable/expensive verdicts, e.g. email verification (7 d)
export const cachingConfig = registerAs('caching', () => ({
  tiers: {
    DEFAULT: ttl(process.env.CACHE_DEFAULT_TTL_MS, 60000),
    LONG: ttl(process.env.CACHE_LONG_TTL_MS, 3600000),
    LONGER: ttl(process.env.CACHE_LONGER_TTL_MS, 604800000),
  },
}));

export type CachingConfig = ReturnType<typeof cachingConfig>;
