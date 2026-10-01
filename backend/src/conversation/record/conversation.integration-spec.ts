import {
  createIntegrationDb,
  describeIntegration,
  IntegrationDb,
} from '@test/support/integration/integration-db';
import { assertTableSchema } from '@test/support/integration/schema-contract';

import { CONVERSATION_TABLE } from './conversation.schema';
import { PARTICIPANT_TABLE } from './participant.schema';

describeIntegration('CONVERSATION schema contract', () => {
  let db: IntegrationDb;

  beforeAll(async () => {
    db = await createIntegrationDb();
  });

  afterAll(async () => {
    await db.close();
  });

  it('matches the live DEV DB2 table definition', async () => {
    await assertTableSchema(db.db2, db.config.schema, CONVERSATION_TABLE);
    await assertTableSchema(db.db2, db.config.schema, PARTICIPANT_TABLE);
  });
});
