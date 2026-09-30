import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AlertService } from 'src/alerting/alert.service';
import { DB2_HEALTH_CHANGED_EVENT } from 'src/database/database.event.constant';
import type { Db2HealthChangedEvent } from 'src/database/database.event.constant';

@Injectable()
export class Db2AlertSubscriber {
  constructor(private readonly alerts: AlertService) {}

  @OnEvent(DB2_HEALTH_CHANGED_EVENT)
  onHealthChanged({ status, error }: Db2HealthChangedEvent): void {
    if (status === 'down') {
      this.alerts.notice({ error }, 'DB2 unreachable', 'warning');
    } else {
      this.alerts.notice({}, 'DB2 reachable', 'good');
    }
  }
}
