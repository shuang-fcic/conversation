import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { AlertService } from 'src/alerting/alert.service';

// connectFailed fires on every retry, so reportedDown emits only one alert per outage.
@Injectable()
export class RmqAlertSubscriber implements OnApplicationBootstrap {
  private reportedDown = false;

  constructor(
    private readonly amqp: AmqpConnection,
    private readonly alerts: AlertService,
  ) {}

  onApplicationBootstrap(): void {
    const connection = this.amqp.managedConnection;

    connection.on('disconnect', ({ err }: { err?: Error }) => {
      this.reportedDown = true;
      this.alerts.notice(
        { err: err?.message },
        'RabbitMQ disconnected',
        'warning',
      );
    });

    connection.on('connectFailed', ({ err }: { err?: Error }) => {
      if (!this.reportedDown) {
        this.reportedDown = true;
        this.alerts.notice(
          { err: err?.message },
          'RabbitMQ connect failed',
          'warning',
        );
      }
    });

    connection.on('connect', () => {
      this.reportedDown = false;
      this.alerts.notice({}, 'RabbitMQ connected', 'good');
    });
  }
}
