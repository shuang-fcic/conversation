import { Alert } from './alert.type';
import { TeamsAlertChannel } from './teams.alert-channel';

describe('TeamsAlertChannel', () => {
  const alert: Alert = {
    kind: 'severity',
    level: 'fatal',
    title: 'Process failed',
    context: {
      attempt: 2,
      retrying: false,
      metadata: { queue: 'events' },
      missing: null,
    },
    timestamp: '2026-07-14T12:00:00.000Z',
  };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
  });

  it('posts an adaptive card to every configured webhook', async () => {
    const channel = new TeamsAlertChannel(
      ['https://teams.test/one', 'https://teams.test/two'],
      'ms-messaging',
      'blue',
    );

    await channel.send(alert);

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, request] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://teams.test/one');
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );
    const card = JSON.parse(request.body as string);
    const body = card.attachments[0].content.body;
    expect(body[0]).toEqual(
      expect.objectContaining({
        text: '🚨 FATAL (ms-messaging)',
        color: 'Attention',
      }),
    );
    expect(body[2].facts).toEqual([
      { title: 'attempt', value: '2' },
      { title: 'retrying', value: 'false' },
      { title: 'metadata', value: '{"queue":"events"}' },
      { title: 'missing', value: '' },
    ]);
    expect(body.at(-1).text).toContain('blue');
  });

  it('succeeds when at least one webhook accepts the alert', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const channel = new TeamsAlertChannel(['one', 'two'], 'app', '');

    await expect(channel.send(alert)).resolves.toBeUndefined();
  });

  it('rejects when every webhook fails', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const channel = new TeamsAlertChannel(['one', 'two'], 'app', '');

    await expect(channel.send(alert)).rejects.toThrow(
      'All Teams webhook deliveries failed',
    );
  });

  it.each([
    ['good', '✅ NOTICE (app)', 'Good'],
    ['warning', '⚠️ NOTICE (app)', 'Warning'],
    ['neutral', 'ℹ️ NOTICE (app)', 'Default'],
  ] as const)('styles %s notices', async (style, heading, color) => {
    const channel = new TeamsAlertChannel(['one'], 'app', '');

    await channel.send({
      ...alert,
      kind: 'notice',
      level: undefined,
      style,
      context: {},
    });

    const request = (fetch as jest.Mock).mock.calls[0][1];
    const body = JSON.parse(request.body as string).attachments[0].content.body;
    expect(body[0]).toEqual(expect.objectContaining({ text: heading, color }));
    expect(body).toHaveLength(3);
  });
});
