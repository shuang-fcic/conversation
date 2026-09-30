import { Command, Option } from 'nest-commander';

import {
  CronCommand,
  CronReport,
  CronRunContext,
} from 'src/cron/cron.command.base';
import { CronExecutionSkipped } from 'src/cron/cron.error';
import { Db2Repository } from 'src/database/database.db2.repository';

// Example scheduled job: proves the cron composition root boots, gates on a
// dependency in before(), and emits the cron.report line. Replace with real
// maintenance jobs (e.g. a notification-digest or stale-conversation sweep).
@Command({
  name: 'example-sweep',
  description: 'Example cron job — verifies the cron engine end to end',
})
export class ExampleSweepCommand extends CronCommand {
  constructor(private readonly db2Repository: Db2Repository) {
    super();
  }

  protected override async before(): Promise<void> {
    if (!(await this.db2Repository.isConnected())) {
      throw new CronExecutionSkipped({
        reason: 'dependency-unavailable',
        context: { dependency: 'db2' },
      });
    }
  }

  protected execute(ctx: CronRunContext): Promise<CronReport> {
    this.logger.log({ actor: ctx.actor }, 'Example sweep ran');
    return Promise.resolve({ output: { swept: 0 }, failed: false });
  }

  @Option({
    flags: '--actor <id>',
    description: 'Operator id recorded as the audit actor (createdBy)',
    required: true,
  })
  parseActor(value: string): string {
    return value;
  }
}
