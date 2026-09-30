import { AlertService } from './alert.service';
import { AlertChannel } from './alert.type';

describe('AlertService', () => {
  const config = { throttleWindowMs: 1_000, throttleMax: 2 };
  let channel: jest.Mocked<AlertChannel>;

  beforeEach(() => {
    channel = {
      enabled: true,
      send: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
  });

  it.each([
    ['fatal', 'fatal'],
    ['error', 'error'],
    ['warn', 'warn'],
  ] as const)(
    'dispatches %s severity alerts with a timestamp',
    async (method, level) => {
      const service = new AlertService(channel, config);

      service[method]({ messageRecordPublicId: 'pub-1' }, 'Delivery failed');
      await service.flush();

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'severity',
          level,
          title: 'Delivery failed',
          context: { messageRecordPublicId: 'pub-1' },
          timestamp: expect.any(String),
        }),
      );
    },
  );

  it('dispatches notices with the requested style', async () => {
    const service = new AlertService(channel, config);

    service.notice({ dependency: 'db2' }, 'Dependency recovered', 'good');
    await service.flush();

    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'notice',
        style: 'good',
        title: 'Dependency recovered',
      }),
    );
  });

  it('throttles independently by severity and title, then opens a new window', async () => {
    const service = new AlertService(channel, config);

    service.warn({}, 'Repeated');
    service.warn({}, 'Repeated');
    service.warn({}, 'Repeated');
    service.error({}, 'Repeated');
    service.warn({}, 'Different');
    await service.flush();

    expect(channel.send).toHaveBeenCalledTimes(4);

    jest.spyOn(Date, 'now').mockReturnValue(11_000);
    service.warn({}, 'Repeated');
    await service.flush();

    expect(channel.send).toHaveBeenCalledTimes(5);
  });

  it('does not dispatch when the channel is disabled', async () => {
    channel.enabled = false;
    const service = new AlertService(channel, config);

    service.error({}, 'Still logged');
    await service.flush();

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('isolates delivery failures and flush waits for their handling', async () => {
    channel.send.mockRejectedValue(new Error('Teams unavailable'));
    const service = new AlertService(channel, config);

    service.error({}, 'Delivery failed');

    await expect(service.flush()).resolves.toBeUndefined();
  });

  it('bounds flush when a delivery does not settle', async () => {
    jest.useFakeTimers();
    channel.send.mockReturnValue(new Promise<never>(() => undefined));
    const service = new AlertService(channel, config);
    service.notice({}, 'Pending');

    const flushed = service.flush(25);
    await jest.advanceTimersByTimeAsync(25);

    await expect(flushed).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
