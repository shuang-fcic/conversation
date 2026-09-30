import { Logger } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AlertService } from 'src/alerting/alert.service';
import { EXIT_CODE } from 'src/common/constants/exit-code.constant';
import { DomainError } from 'src/common/error/domain.error';
import { cronConfig } from 'src/cron/cron.config';
import { getJobName, getRunId } from 'src/cron/cron.run.util';

async function bootstrap() {
  const job = getJobName();

  if (!cronConfig().enabled) {
    process.stderr.write('Cron execution disabled by CRON_ENABLED\n');
    return;
  }
  if (!cronConfig().jobs.includes(job)) {
    process.stderr.write(
      `Cron job "${job}" is not in the CRON_JOBS allowlist — skipping\n`,
    );
    return;
  }

  const { CronModule } = await import('./cron/cron.module.js');
  const app = await CommandFactory.createWithoutRunning(CronModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  const alerts = app.get(AlertService);
  const runId = getRunId();

  try {
    await CommandFactory.runApplication(app);
  } catch (error) {
    if (error instanceof DomainError) {
      process.exitCode = EXIT_CODE.DOMAIN_ERROR;
    } else {
      process.exitCode = EXIT_CODE.FAILURE;
      new Logger('Cron').error({ job, runId, error }, 'Cron command failed');
      alerts.fatal({ job, runId }, 'Cron command failed');
      await alerts.flush();
    }
  } finally {
    await app.close();
  }
}

void bootstrap();
