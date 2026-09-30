import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

import { AlertService } from 'src/alerting/alert.service';
import { appConfig } from 'src/common/config/app.config';

@Injectable()
export class LifecycleAlertSubscriber
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    private readonly alerts: AlertService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  onApplicationBootstrap(): void {
    this.alerts.notice(
      { instance: this.config.instanceId || 'default' },
      `Application instance started`,
      'good',
    );
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.alerts.notice(
      { instance: this.config.instanceId || 'default', signal },
      `Application instance shutting down`,
      'warning',
    );
    await this.alerts.flush();
  }
}
