import { Logger } from '@nestjs/common';
import { CommandRunner } from 'nest-commander';

import { EXIT_CODE } from 'src/common/constants/exit-code.constant';
import { printJson } from 'src/common/utils/print-json.util';
import { CronExecutionSkipped } from 'src/cron/cron.error';

export interface CronRunContext {
  actor: string;
  asOf: Date;
}

export interface CronReport {
  output: Record<string, unknown>;
  failed: boolean;
}

interface CronCommandOptions {
  actor: string;
}

// Job-specific fan-out belongs in execute(); this base only owns run reporting.
export abstract class CronCommand extends CommandRunner {
  protected readonly logger: Logger;

  protected constructor() {
    super();
    this.logger = new Logger(this.constructor.name);
  }

  protected abstract execute(ctx: CronRunContext): Promise<CronReport>;

  protected before(): Promise<void> | void {}

  async run(
    _passedParams: string[],
    options: CronCommandOptions,
  ): Promise<void> {
    const asOf = new Date();
    const startedAt = Date.now();

    let report: CronReport;
    let status: 'ok' | 'partial-failure' | 'skipped';

    try {
      await this.before();
      report = await this.execute({
        actor: options.actor,
        asOf,
      });
      status = report.failed ? 'partial-failure' : 'ok';
    } catch (error) {
      if (!(error instanceof CronExecutionSkipped)) throw error;

      this.logger.warn(
        { ...error.context, reason: error.reason, error: error.error },
        'Cron execution skipped',
      );
      report = {
        output: {
          ...error.context,
          skipped: true,
          skipReason: error.reason,
        },
        failed: true,
      };
      status = 'skipped';
    }

    const { output, failed } = report;

    this.logger.log(
      {
        status,
        durationMs: Date.now() - startedAt,
        ...output,
      },
      'cron.report',
    );
    printJson(output);

    if (failed) {
      process.exitCode = EXIT_CODE.FAILURE;
    }
  }
}
