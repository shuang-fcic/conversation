import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CronEnv {
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  CRON_ENABLED?: string;

  @IsOptional()
  @IsString()
  CRON_JOBS?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  CRON_SCAN_BATCH_SIZE?: number;
}

export const cronConfig = registerAs('cron', () => ({
  enabled: process.env.CRON_ENABLED === 'true',

  jobs: (process.env.CRON_JOBS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  batchSize: process.env.CRON_SCAN_BATCH_SIZE
    ? parseInt(process.env.CRON_SCAN_BATCH_SIZE, 10)
    : 500,
}));

export type CronConfig = ReturnType<typeof cronConfig>;
