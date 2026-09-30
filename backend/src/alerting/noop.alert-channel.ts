import { Alert, AlertChannel } from './alert.type';

/** Used when no webhook URL is configured: alerting is disabled, dispatch is a no-op. */
export class NoopAlertChannel implements AlertChannel {
  readonly enabled = false;

  async send(_alert: Alert): Promise<void> {
    // intentionally does nothing
  }
}
