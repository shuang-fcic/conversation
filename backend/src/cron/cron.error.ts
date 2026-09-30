interface CronExecutionSkippedOptions {
  reason: string;
  context?: Record<string, unknown>;
  error?: unknown;
}

export class CronExecutionSkipped extends Error {
  readonly reason: string;
  readonly context: Record<string, unknown>;
  readonly error?: unknown;

  constructor(options: CronExecutionSkippedOptions) {
    super('Cron execution skipped');
    this.name = CronExecutionSkipped.name;
    this.reason = options.reason;
    this.context = options.context ?? {};
    this.error = options.error;
  }
}
