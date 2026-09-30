import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AlertingEnv {
  @IsOptional()
  @IsString()
  TEAMS_ALERT_WEBHOOK_URL?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  ALERT_THROTTLE_WINDOW_MS?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  ALERT_THROTTLE_MAX?: number;
}

export const alertingConfig = registerAs('alerting', () => ({
  teamsWebhookUrls: (process.env.TEAMS_ALERT_WEBHOOK_URL ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),

  throttleWindowMs: process.env.ALERT_THROTTLE_WINDOW_MS
    ? Number(process.env.ALERT_THROTTLE_WINDOW_MS)
    : 60000,
  throttleMax: process.env.ALERT_THROTTLE_MAX
    ? Number(process.env.ALERT_THROTTLE_MAX)
    : 1,
}));

export type AlertingConfig = ReturnType<typeof alertingConfig>;
