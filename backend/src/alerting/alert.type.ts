export type AlertLevel = 'fatal' | 'error' | 'warn';

export type NoticeStyle = 'good' | 'warning' | 'neutral';

export interface Alert {
  kind: 'severity' | 'notice';
  level?: AlertLevel;
  style?: NoticeStyle;
  /** Must remain PII-free because it is sent to Teams. */
  title: string;
  /** Callers must keep context PII-free. */
  context: Record<string, unknown>;
  timestamp: string;
}

export interface AlertChannel {
  readonly enabled: boolean;
  send(alert: Alert): Promise<void>;
}

export const ALERT_CHANNEL = Symbol('ALERT_CHANNEL');
