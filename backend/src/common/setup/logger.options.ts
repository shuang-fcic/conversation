import * as os from 'os';
import { join } from 'path';

import { type ConfigType } from '@nestjs/config';
import { Params } from 'nestjs-pino';

import { appConfig } from 'src/common/config/app.config';

function rollOptions(file: string, extra: Record<string, unknown> = {}) {
  return {
    file,
    frequency: 'daily',
    dateFormat: 'yyyy-MM-dd',
    mkdir: true,
    ...extra,
  };
}

// Single source of truth for the log-file naming rule, shared by the pino
// builders below and the cleanup-logs cron job. pino-roll appends a date/number
// suffix to each base, so consumers match on prefix, not exact name.
export function logFileBaseNames(app: ConfigType<typeof appConfig>) {
  const instanceSuffix = app.instanceId ? `.${app.instanceId}` : '';
  return {
    app: `${app.appId}${instanceSuffix}.app`,
    cron: `${app.appId}${instanceSuffix}.cron`,
  };
}

// Error streams carry `.err.` in their name (`.app.err.log`, `.cron.err.<job>.log`);
// everything else is an info/app log. This is the discriminator the cleanup uses.
export const isErrorLogFile = (name: string): boolean => name.includes('.err.');

const prettyTarget = (app: ConfigType<typeof appConfig>) =>
  app.isProduction
    ? []
    : [{ target: 'pino-pretty', level: 'trace', options: { colorize: true } }];

export function buildLoggerConfig(app: ConfigType<typeof appConfig>): Params {
  const logLocation = join(app.logDir, logFileBaseNames(app).app);

  return {
    pinoHttp: {
      // Avoid flooding the rolling log with the frequent liveness probe.
      autoLogging: {
        ignore: (req) => (req.url?.split('?')[0] ?? req.url) === '/health/live',
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
        ],
        censor: '[Redacted]',
      },
      transport: {
        targets: [
          // No pino-roll `limit`: count-based pruning does not prune across
          // process restarts without `removeOtherLogFiles`, so retention is
          // owned entirely by the age-based `cleanup-logs` cron job.
          {
            target: 'pino-roll',
            level: 'info',
            options: rollOptions(`${logLocation}.log`),
          },
          {
            target: 'pino-roll',
            level: 'warn',
            options: rollOptions(`${logLocation}.err.log`),
          },
          ...prettyTarget(app),
        ],
      },
    },
  };
}

// Each cron invocation is a new process, so cross-run pruning is required; job
// names isolate streams and runId distinguishes concurrent writes to one stream.
export function buildCronLoggerConfig(
  app: ConfigType<typeof appConfig>,
  run: { job: string; runId: string },
): Params {
  const prefix = join(app.logDir, logFileBaseNames(app).cron);
  const limit = { count: 60, removeOtherLogFiles: true };

  return {
    pinoHttp: {
      base: {
        pid: process.pid,
        hostname: os.hostname(),
        job: run.job,
        runId: run.runId,
      },
      transport: {
        targets: [
          {
            target: 'pino-roll',
            level: 'info',
            options: rollOptions(`${prefix}.${run.job}.log`, { limit }),
          },
          {
            target: 'pino-roll',
            level: 'warn',
            options: rollOptions(`${prefix}.err.${run.job}.log`, { limit }),
          },
          ...prettyTarget(app),
        ],
      },
    },
  };
}
