import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ThrottlerEnv {
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  THROTTLER_GLOBAL_SPAN!: number;

  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  THROTTLER_GLOBAL_LIMIT!: number;

  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  THROTTLER_WORKFLOW_SPAN!: number;

  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  THROTTLER_WORKFLOW_LIMIT!: number;
}

export const throttlerConfig = registerAs('throttler', () => ({
  global: {
    span: parseInt(process.env.THROTTLER_GLOBAL_SPAN as string, 10),
    limit: parseInt(process.env.THROTTLER_GLOBAL_LIMIT as string, 10),
  },
  workflow: {
    span: parseInt(process.env.THROTTLER_WORKFLOW_SPAN as string, 10),
    limit: parseInt(process.env.THROTTLER_WORKFLOW_LIMIT as string, 10),
  },
}));

export type ThrottlerConfig = ReturnType<typeof throttlerConfig>;
