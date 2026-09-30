import { randomUUID } from 'crypto';

// Filename-safe allowlist (mirrors INSTANCE_ID): the job is interpolated into
// the log-file path, so an option like `--help` or a traversal arg falls back
// to `cron` rather than escaping LOG_DIR or producing an odd filename.
const SAFE_JOB = /^[A-Za-z0-9_-]+$/;

export function getJobName(argv: string[] = process.argv): string {
  const arg = argv[2];
  return arg && !arg.startsWith('-') && SAFE_JOB.test(arg) ? arg : 'cron';
}

let runId: string | undefined;

// Memoized so the logger `base` bindings and cron.ts's fatal alert share one
// id — regenerating would mint two. Ephemeral per-process derived state, read
// by the logger's `forRootAsync` factory at module-init (before any command
// exists), so it's a plain function rather than a DI provider.
export function getRunId(): string {
  return (runId ??= randomUUID());
}
