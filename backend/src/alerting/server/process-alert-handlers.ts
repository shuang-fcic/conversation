import { Logger } from '@nestjs/common';

import { AlertService } from 'src/alerting/alert.service';

// Flush before exiting so last-resort alerts are not lost in fire-and-forget dispatch.
export function registerProcessAlertHandlers(alerts: AlertService): void {
  const logger = new Logger('ProcessAlerts');

  const handle = (message: string, err: unknown) => {
    const context = {
      err: err instanceof Error ? err.message : String(err),
    };
    logger.fatal(context, message);
    alerts.fatal(context, message);
    void alerts.flush().finally(() => process.exit(1));
  };

  process.on('uncaughtException', (err) => handle('Uncaught exception', err));
  process.on('unhandledRejection', (reason) =>
    handle('Unhandled promise rejection', reason),
  );
}
