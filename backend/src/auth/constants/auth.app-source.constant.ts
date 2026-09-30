export enum APP_SOURCE {
  // Customer + agent frontend (portal / BFF).
  RC_NEXT = 'rc-next',
  // The messaging service creating a conversation on a quote trigger.
  MS_MESSAGING = 'ms-messaging',
  // This service's own cron container.
  CONV_CRON = 'conversations-cron',
}
