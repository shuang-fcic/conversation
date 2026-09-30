import { ConsoleLogger } from '@nestjs/common';

/**
 * CLI logger that drops RabbitMQ channel-teardown noise emitted during shutdown.
 *
 * The CLI imports RmqModule (retry-publish publishes) but most commands never
 * touch the broker. With connectionInitOptions.wait=false the channel is still
 * asserting when a short-lived command exits; app.close() then aborts that
 * in-flight setup and @golevelup logs the abort as an AmqpConnection error.
 * amqp-connection-manager can't tell an intentional-close abort from a real
 * failure — so we supply that context: once close() has begun, AmqpConnection
 * errors are expected teardown chatter. Real broker failures surface during the
 * command (RmqService's own error, waitForConnection's throw, exit code) before
 * `shuttingDown` is ever set.
 */
export class CliLogger extends ConsoleLogger {
  shuttingDown = false;

  error(message: unknown, ...rest: unknown[]): void {
    if (this.shuttingDown && rest.at(-1) === 'AmqpConnection') return;
    super.error(message, ...(rest as [string?, string?]));
  }
}
