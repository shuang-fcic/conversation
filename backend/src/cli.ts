import { CommandFactory } from 'nest-commander';

import { AlertService } from 'src/alerting/alert.service';
import { EXIT_CODE } from 'src/common/constants/exit-code.constant';
import { DomainError } from 'src/common/error/domain.error';
import { CliLogger } from 'src/scripts/cli.logger';
import { ScriptsModule } from 'src/scripts/scripts.module';

// Keep stdout reserved for command output; Nest diagnostics go to stderr.
async function bootstrap() {
  const logger = new CliLogger({ logLevels: ['error', 'fatal'] });
  const app = await CommandFactory.createWithoutRunning(ScriptsModule, {
    logger,
  });
  const alerts = app.get(AlertService);

  try {
    await CommandFactory.runApplication(app);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    if (error instanceof DomainError) {
      process.exitCode = EXIT_CODE.DOMAIN_ERROR;
    } else {
      process.exitCode = EXIT_CODE.FAILURE;
      alerts.fatal({ command: process.argv[2] }, 'CLI command failed');
      await alerts.flush();
    }
  } finally {
    logger.shuttingDown = true;
    await app.close();
  }
}

void bootstrap();
