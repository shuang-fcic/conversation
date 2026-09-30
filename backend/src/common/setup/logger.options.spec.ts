import { type ConfigType } from '@nestjs/config';

import { appConfig } from 'src/common/config/app.config';

import { buildCronLoggerConfig, buildLoggerConfig } from './logger.options';

type AppConfig = ConfigType<typeof appConfig>;

const buildApp = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  appId: 'ms-messaging',
  deployEnv: '',
  isProduction: true,
  swaggerEnabled: false,
  port: 3000,
  logDir: '/app/logs',
  instanceId: '',
  ...overrides,
});

type Target = { target: string; level?: string; options?: { file?: string } };
type BuiltConfig = { pinoHttp?: unknown };

const transportTargets = (config: BuiltConfig): Target[] => {
  const pinoHttp = config.pinoHttp as { transport?: { targets?: Target[] } };
  return pinoHttp.transport?.targets ?? [];
};

const targetFiles = (config: BuiltConfig): string[] =>
  transportTargets(config)
    .filter((t) => t.target === 'pino-roll')
    .map((t) => t.options?.file ?? '');

const base = (config: BuiltConfig): Record<string, unknown> =>
  (config.pinoHttp as { base?: Record<string, unknown> }).base ?? {};

describe('buildLoggerConfig (server)', () => {
  it('writes the app log stream', () => {
    const files = targetFiles(buildLoggerConfig(buildApp()));

    expect(files).toEqual([
      '/app/logs/ms-messaging.app.log',
      '/app/logs/ms-messaging.app.err.log',
    ]);
  });

  it('suffixes the filename with INSTANCE_ID so instances never share a file', () => {
    const files = targetFiles(
      buildLoggerConfig(buildApp({ instanceId: 'm0' })),
    );

    expect(files).toEqual([
      '/app/logs/ms-messaging.m0.app.log',
      '/app/logs/ms-messaging.m0.app.err.log',
    ]);
  });

  it('does not set a pino-roll count limit (retention is owned by cleanup-logs)', () => {
    const rollTargets = transportTargets(buildLoggerConfig(buildApp())).filter(
      (t) => t.target === 'pino-roll',
    );

    for (const t of rollTargets) {
      expect((t.options as { limit?: unknown }).limit).toBeUndefined();
    }
  });

  it('adds the pretty transport only outside production', () => {
    const prod = transportTargets(
      buildLoggerConfig(buildApp({ isProduction: true })),
    );
    const dev = transportTargets(
      buildLoggerConfig(buildApp({ isProduction: false })),
    );

    expect(prod.some((t) => t.target === 'pino-pretty')).toBe(false);
    expect(dev.some((t) => t.target === 'pino-pretty')).toBe(true);
  });
});

describe('buildCronLoggerConfig', () => {
  const run = { job: 'expire-messages', runId: 'run-123' };

  it('writes per-job cron files (all + err), distinct from the server app.log', () => {
    const files = targetFiles(buildCronLoggerConfig(buildApp(), run));

    expect(files).toEqual([
      '/app/logs/ms-messaging.cron.expire-messages.log',
      '/app/logs/ms-messaging.cron.err.expire-messages.log',
    ]);
    expect(files).not.toContain('/app/logs/ms-messaging.app.log');
  });

  it('names files per job so two jobs never collide', () => {
    const cleanup = targetFiles(
      buildCronLoggerConfig(buildApp(), {
        job: 'cleanup-documents',
        runId: 'r',
      }),
    );

    expect(cleanup).toEqual([
      '/app/logs/ms-messaging.cron.cleanup-documents.log',
      '/app/logs/ms-messaging.cron.err.cleanup-documents.log',
    ]);
  });

  it('suffixes with INSTANCE_ID', () => {
    const files = targetFiles(
      buildCronLoggerConfig(buildApp({ instanceId: 'm0' }), run),
    );

    expect(files).toEqual([
      '/app/logs/ms-messaging.m0.cron.expire-messages.log',
      '/app/logs/ms-messaging.m0.cron.err.expire-messages.log',
    ]);
  });

  it('stamps job + runId (and keeps pid/hostname) on every line via base', () => {
    const bindings = base(buildCronLoggerConfig(buildApp(), run));

    expect(bindings.job).toBe('expire-messages');
    expect(bindings.runId).toBe('run-123');
    expect(bindings.pid).toBe(process.pid);
    expect(bindings.hostname).toEqual(expect.any(String));
  });

  it('prunes across runs (removeOtherLogFiles) on the roll targets', () => {
    const targets = transportTargets(buildCronLoggerConfig(buildApp(), run));
    const rollTargets = targets.filter((t) => t.target === 'pino-roll');

    for (const t of rollTargets) {
      const limit = (t.options as { limit?: { removeOtherLogFiles?: boolean } })
        .limit;
      expect(limit?.removeOtherLogFiles).toBe(true);
    }
  });
});
