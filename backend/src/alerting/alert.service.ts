import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { ALERT_CHANNEL } from './alert.type';
import type { Alert, AlertChannel, NoticeStyle } from './alert.type';
import { alertingConfig } from './alerting.config';

// Dispatch is failure-isolated and fire-and-forget; exiting processes call flush().
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly windows = new Map<
    string,
    { count: number; expiry: number }
  >();

  constructor(
    @Inject(ALERT_CHANNEL) private readonly channel: AlertChannel,
    @Inject(alertingConfig.KEY)
    private readonly config: ConfigType<typeof alertingConfig>,
  ) {
    if (!this.channel.enabled) {
      this.logger.log(
        {},
        'Teams alerting disabled (no TEAMS_ALERT_WEBHOOK_URL configured)',
      );
    }
  }

  fatal(context: Record<string, unknown>, message: string): void {
    this.emit({ kind: 'severity', level: 'fatal', title: message, context });
  }

  error(context: Record<string, unknown>, message: string): void {
    this.emit({ kind: 'severity', level: 'error', title: message, context });
  }

  warn(context: Record<string, unknown>, message: string): void {
    this.emit({ kind: 'severity', level: 'warn', title: message, context });
  }

  notice(
    context: Record<string, unknown>,
    message: string,
    style: NoticeStyle = 'neutral',
  ): void {
    this.emit({ kind: 'notice', style, title: message, context });
  }

  private emit(alert: Omit<Alert, 'timestamp'>): void {
    const logContext = { ...alert.context, alert: true };
    switch (alert.level) {
      case 'fatal':
        this.logger.fatal(logContext, alert.title);
        break;
      case 'error':
        this.logger.error(logContext, alert.title);
        break;
      case 'warn':
        this.logger.warn(logContext, alert.title);
        break;
      default:
        this.logger.log(logContext, alert.title);
    }

    if (!this.channel.enabled) return;
    if (this.throttled(this.key(alert))) return;

    this.dispatch({ ...alert, timestamp: new Date().toISOString() });
  }

  private dispatch(alert: Alert): void {
    const promise = this.channel
      .send(alert)
      .catch((error: unknown) =>
        this.logger.error(
          { title: alert.title, err: errorMessage(error) },
          'Alert delivery failed',
        ),
      )
      .finally(() => this.inFlight.delete(promise));
    this.inFlight.add(promise);
  }

  /** Waits up to `timeoutMs`; delivery delays never hold shutdown indefinitely. */
  async flush(timeoutMs = 3000): Promise<void> {
    if (this.inFlight.size === 0) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled([...this.inFlight]),
        new Promise((resolve) => {
          timeout = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private key(alert: Omit<Alert, 'timestamp'>): string {
    return alert.kind === 'severity'
      ? `${alert.level}:${alert.title}`
      : `notice:${alert.title}`;
  }

  private throttled(key: string): boolean {
    const now = Date.now();
    const window = this.windows.get(key);
    if (!window || window.expiry <= now) {
      this.windows.set(key, {
        count: 1,
        expiry: now + this.config.throttleWindowMs,
      });
      return false;
    }
    if (window.count < this.config.throttleMax) {
      window.count += 1;
      return false;
    }
    return true;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
