import {
  createIntegrationDb,
  describeIntegration,
  IntegrationDb,
} from '@test/support/integration/integration-db';
import { assertTableSchema } from '@test/support/integration/schema-contract';

import { MESSAGE_TABLE } from './message.schema';

describeIntegration('MESSAGE schema contract', () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it('matches the live DEV DB2 table definition', async () => {
    await assertTableSchema(db.db2, db.config.schema, MESSAGE_TABLE);
  });
});
