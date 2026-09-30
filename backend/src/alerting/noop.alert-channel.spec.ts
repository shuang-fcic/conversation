import { NoopAlertChannel } from './noop.alert-channel';

describe('NoopAlertChannel', () => {
  it('is disabled and accepts alerts without side effects', async () => {
    const channel = new NoopAlertChannel();

    expect(channel.enabled).toBe(false);
    await expect(
      channel.send({
        kind: 'notice',
        title: 'Ignored',
        context: {},
        timestamp: '2026-07-14T00:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });
});
