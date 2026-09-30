import { Command, CommandRunner } from 'nest-commander';

import { printJson } from 'src/common/utils/print-json.util';
import { Db2Repository } from 'src/database/database.db2.repository';

// Example operational command: verifies the CLI composition root boots and can
// reach DB2. Replace/extend with real ops commands as the domain grows.
@Command({
  name: 'db-ping',
  description: 'Check DB2 connectivity from the CLI composition root',
})
export class DbPingCommand extends CommandRunner {
  constructor(private readonly db2Repository: Db2Repository) {
    super();
  }

  async run(): Promise<void> {
    const connected = await this.db2Repository.isConnected();
    printJson({ connected });
  }
}
