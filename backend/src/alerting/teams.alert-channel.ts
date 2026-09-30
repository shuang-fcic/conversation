import { Alert, AlertChannel } from './alert.type';

const POST_TIMEOUT_MS = 5000;

export class TeamsAlertChannel implements AlertChannel {
  readonly enabled = true;

  constructor(
    private readonly urls: string[],
    private readonly appId: string,
    private readonly instanceId: string,
  ) {}

  async send(alert: Alert): Promise<void> {
    const body = JSON.stringify(this.buildCard(alert));
    const results = await Promise.allSettled(
      this.urls.map((url) => this.post(url, body)),
    );
    // One healthy webhook is enough for a successful fan-out.
    if (results.every((r) => r.status === 'rejected')) {
      throw new Error('All Teams webhook deliveries failed');
    }
  }

  private async post(url: string, body: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Teams webhook responded ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private buildCard(alert: Alert) {
    const color =
      alert.kind === 'severity'
        ? alert.level === 'warn'
          ? 'Warning'
          : 'Attention'
        : alert.style === 'good'
          ? 'Good'
          : alert.style === 'warning'
            ? 'Warning'
            : 'Default';

    const label =
      alert.kind === 'severity' ? alert.level!.toUpperCase() : 'NOTICE';

    const contextFacts = Object.entries(alert.context).map(
      ([title, value]) => ({
        title,
        value: factValue(value),
      }),
    );

    const footer = [
      ...(this.instanceId ? [this.instanceId] : []),
      formatTimestamp(new Date(alert.timestamp)),
    ].join(' · ');

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                text: `${emoji(alert)} ${label} (${this.appId})`,
                weight: 'Bolder',
                size: 'Large',
                color,
              },
              { type: 'TextBlock', text: alert.title, wrap: true },
              ...(contextFacts.length
                ? [{ type: 'FactSet', facts: contextFacts }]
                : []),
              {
                type: 'TextBlock',
                text: footer,
                isSubtle: true,
                size: 'Small',
                wrap: true,
                spacing: 'Medium',
              },
            ],
          },
        },
      ],
    };
  }
}

function emoji(alert: Alert): string {
  if (alert.kind === 'severity') {
    return alert.level === 'fatal'
      ? '🚨'
      : alert.level === 'warn'
        ? '⚠️'
        : '❌';
  }
  return alert.style === 'good'
    ? '✅'
    : alert.style === 'warning'
      ? '⚠️'
      : 'ℹ️';
}

/** Uses the process timezone and includes its label to keep the time unambiguous. */
function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date);
}

function factValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' || typeof value === 'function') {
    return JSON.stringify(value) ?? '';
  }
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'string') return value;
  return '';
}
