import { registerAs } from '@nestjs/config';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class DatabaseEnv {
  @IsString()
  @IsNotEmpty()
  DB2_SYSTEM!: string;

  @IsString()
  @IsNotEmpty()
  DB2_UID!: string;

  @IsString()
  @IsNotEmpty()
  DB2_PWD!: string;

  @IsString()
  @IsNotEmpty()
  DB2_SCHEMA!: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  DB2_TIMEZONE_OFFSET_TTL_MS?: number;

  // IBM i Access ODBC access mode: 0=read/write, 1=read/call, 2=read-only.
  // Unset in prod (read/write); integration tests set 2 for a driver-level guard.
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(0)
  DB2_CONNECTION_TYPE?: number;
}

export const databaseConfig = registerAs('database', () => ({
  system: process.env.DB2_SYSTEM as string,
  uid: process.env.DB2_UID as string,
  pwd: process.env.DB2_PWD as string,
  schema: process.env.DB2_SCHEMA as string,

  // Refresh often enough to pick up server timezone/DST changes without restart.
  timezoneOffsetTtlMs: process.env.DB2_TIMEZONE_OFFSET_TTL_MS
    ? parseInt(process.env.DB2_TIMEZONE_OFFSET_TTL_MS, 10)
    : 3600000,

  connectionType: process.env.DB2_CONNECTION_TYPE
    ? parseInt(process.env.DB2_CONNECTION_TYPE, 10)
    : undefined,
}));

export type DatabaseConfig = ReturnType<typeof databaseConfig>;
