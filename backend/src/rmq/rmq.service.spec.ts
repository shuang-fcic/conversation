import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { createMock } from '@golevelup/ts-jest';

import { RmqService } from './rmq.service';

describe('RmqService', () => {
  let amqp: jest.Mocked<AmqpConnection>;
  let service: RmqService;
  // createMock deep-mocks these getters but retains their real static types.
  let isConnected: jest.Mock;
  let waitForConnect: jest.Mock;

  beforeEach(() => {
    amqp = createMock<AmqpConnection>();
    isConnected = amqp.managedConnection.isConnected as jest.Mock;
    waitForConnect = amqp.managedChannel.waitForConnect as jest.Mock;
    service = new RmqService(amqp);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('publish', () => {
    it('publishes persistently and returns the broker ack', async () => {
      amqp.publish.mockResolvedValue(true);

      const result = await service.publish('amq.topic', 'rk', { a: 1 });

      expect(result).toBe(true);
      expect(amqp.publish).toHaveBeenCalledWith(
        'amq.topic',
        'rk',
        { a: 1 },
        expect.objectContaining({ persistent: true }),
      );
    });

    it('returns null (not throws) when the broker errors', async () => {
      amqp.publish.mockRejectedValue(new Error('channel closed'));

      await expect(service.publish('amq.topic', 'rk', {})).resolves.toBeNull();
    });

    it('short-circuits to null without publishing when checkConnect and disconnected', async () => {
      isConnected.mockReturnValue(false);

      const result = await service.publish(
        'amq.topic',
        'rk',
        {},
        {
          checkConnect: true,
        },
      );

      expect(result).toBeNull();
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });

  describe('waitForConnection', () => {
    it('resolves once the channel connects', async () => {
      waitForConnect.mockResolvedValue(undefined);

      await expect(service.waitForConnection(1000)).resolves.toBeUndefined();
    });

    it('rejects after the timeout when the channel never connects', async () => {
      jest.useFakeTimers();
      waitForConnect.mockReturnValue(new Promise(() => {}));

      const pending = service.waitForConnection(1000);
      const assertion = expect(pending).rejects.toThrow(
        'RabbitMQ connection not established within 1000ms',
      );

      await jest.advanceTimersByTimeAsync(1000);
      await assertion;
    });
  });

  describe('isConnected', () => {
    it('reflects the managed connection state', () => {
      isConnected.mockReturnValue(true);
      expect(service.isConnected()).toBe(true);
    });
  });
});
