import { join } from 'path';

import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class AppEnv {
  @IsString()
  @IsNotEmpty()
  APP_ID!: string;

  // Which deployment this instance is (DEV/UAT/STAGING/PROD) — distinct from
  // ENV_PRODUCTION, which is the runtime mode.
  @IsOptional()
  @IsString()
  DEPLOY_ENV?: string;

  @IsOptional()
  @IsString()
  ENV_PRODUCTION?: string;

  @IsOptional()
  @IsString()
  SWAGGER_ENABLED?: string;

  @IsOptional()
  @IsString()
  LOG_DIR?: string;

  // INSTANCE_ID becomes part of a file path, so restrict it to one safe segment.
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]+$/)
  INSTANCE_ID?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  PORT?: number;
}

export const appConfig = registerAs('app', () => ({
  appId: process.env.APP_ID as string,
  deployEnv: process.env.DEPLOY_ENV || '',
  isProduction: process.env.ENV_PRODUCTION === 'true',

  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,

  logDir: process.env.LOG_DIR || join(process.cwd(), 'logs'),

  // pino-roll cannot safely share a file across processes. Do not default to the
  // ephemeral container hostname; multi-instance deployments must assign this.
  instanceId: process.env.INSTANCE_ID || '',
}));

export type AppConfig = ReturnType<typeof appConfig>;
