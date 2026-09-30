import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Options } from 'amqplib';

@Injectable()
export class RmqService {
  private readonly logger = new Logger(RmqService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  isConnected(): boolean {
    return this.amqp.managedConnection.isConnected();
  }

  /**
   * Bounds waitForConnect so short-lived publishers fail instead of hanging.
   */
  async waitForConnection(timeoutMs = 10_000): Promise<void> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `RabbitMQ connection not established within ${timeoutMs}ms`,
            ),
          ),
        timeoutMs,
      );
    });

    try {
      await Promise.race([this.amqp.managedChannel.waitForConnect(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async publish<T = any>(
    exchange: string,
    routingKey: string,
    payload: T,
    options?: Options.Publish & { checkConnect?: boolean },
  ): Promise<boolean | null> {
    const { checkConnect = false, ...publishOptions } = options ?? {};

    if (checkConnect && !this.amqp.managedConnection.isConnected()) {
      this.logger.error(
        {
          exchange,
          routingKey,
        },
        `RmqService: Unable to publish event due to lost connection`,
      );
      return null;
    }

    try {
      return await this.amqp.publish(exchange, routingKey, payload, {
        persistent: true,
        ...publishOptions,
      });
    } catch (error: unknown) {
      this.logger.error(
        {
          exchange,
          routingKey,
          error,
        },
        `RmqService: Unable to publish event due to error`,
      );
      return null;
    }
  }
}
