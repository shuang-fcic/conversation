import { EventEmitter } from 'node:events';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { createMock } from '@golevelup/ts-jest';

import { AlertService } from 'src/alerting/alert.service';

import { Db2AlertSubscriber } from './db2-alert.subscriber';
import { LifecycleAlertSubscriber } from './lifecycle-alert.subscriber';
import { RmqAlertSubscriber } from './rmq-alert.subscriber';

describe('alert subscribers', () => {
  let alerts: jest.Mocked<AlertService>;

  beforeEach(() => {
    alerts = createMock<AlertService>();
  });

  it('maps DB2 health edges to warning and recovery notices', () => {
    const subscriber = new Db2AlertSubscriber(alerts);

    subscriber.onHealthChanged({ status: 'down', error: 'timeout' });
    subscriber.onHealthChanged({ status: 'up' });

    expect(alerts.notice).toHaveBeenNthCalledWith(
      1,
      { error: 'timeout' },
      'DB2 unreachable',
      'warning',
    );
    expect(alerts.notice).toHaveBeenNthCalledWith(
      2,
      {},
      'DB2 reachable',
      'good',
    );
  });

  it('reports lifecycle transitions and flushes shutdown delivery', async () => {
    const subscriber = new LifecycleAlertSubscriber(alerts, {
      instanceId: '',
    } as never);

    subscriber.onApplicationBootstrap();
    await subscriber.onApplicationShutdown('SIGTERM');

    expect(alerts.notice).toHaveBeenNthCalledWith(
      1,
      { instance: 'default' },
      'Application instance started',
      'good',
    );
    expect(alerts.notice).toHaveBeenNthCalledWith(
      2,
      { instance: 'default', signal: 'SIGTERM' },
      'Application instance shutting down',
      'warning',
    );
    expect(alerts.flush).toHaveBeenCalledTimes(1);
  });

  it('edge-triggers RabbitMQ failures until a connection recovers', () => {
    const managedConnection = new EventEmitter();
    const amqp = { managedConnection } as unknown as AmqpConnection;
    const subscriber = new RmqAlertSubscriber(amqp, alerts);
    subscriber.onApplicationBootstrap();

    managedConnection.emit('connectFailed', { err: new Error('boot fail') });
    managedConnection.emit('connectFailed', { err: new Error('retry fail') });
    managedConnection.emit('connect');
    managedConnection.emit('connectFailed', { err: new Error('later fail') });
    managedConnection.emit('disconnect', { err: new Error('dropped') });
    managedConnection.emit('connectFailed', { err: new Error('retry') });

    expect(alerts.notice).toHaveBeenCalledTimes(4);
    expect(alerts.notice).toHaveBeenNthCalledWith(
      1,
      { err: 'boot fail' },
      'RabbitMQ connect failed',
      'warning',
    );
    expect(alerts.notice).toHaveBeenNthCalledWith(
      2,
      {},
      'RabbitMQ connected',
      'good',
    );
    expect(alerts.notice).toHaveBeenNthCalledWith(
      4,
      { err: 'dropped' },
      'RabbitMQ disconnected',
      'warning',
    );
  });
});
