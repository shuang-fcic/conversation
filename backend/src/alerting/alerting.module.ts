import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { appConfig } from 'src/common/config/app.config';

import { AlertService } from './alert.service';
import { ALERT_CHANNEL } from './alert.type';
import { alertingConfig } from './alerting.config';
import { NoopAlertChannel } from './noop.alert-channel';
import { TeamsAlertChannel } from './teams.alert-channel';

// Alert producers remain in AppModule so CLI composition does not emit server events.
@Global()
@Module({
  providers: [
    AlertService,
    {
      provide: ALERT_CHANNEL,
      inject: [alertingConfig.KEY, appConfig.KEY],
      useFactory: (
        alerting: ConfigType<typeof alertingConfig>,
        app: ConfigType<typeof appConfig>,
      ) =>
        alerting.teamsWebhookUrls.length > 0
          ? new TeamsAlertChannel(
              alerting.teamsWebhookUrls,
              app.appId,
              app.instanceId,
            )
          : new NoopAlertChannel(),
    },
  ],
  exports: [AlertService],
})
export class AlertingModule {}
