import { Db2TableSchema } from 'src/database/database.db2.schema';
export const PARTICIPANT_TABLE = {
  table: 'CONVERSATION_AGENT',
  columns: [
    { name: 'CONVERSATION_ID', kind: 'NUMERIC', nullable: false },
    { name: 'AGENT_ID', kind: 'STRING', nullable: false },
    { name: 'EMAIL', kind: 'STRING', nullable: true },
    { name: 'NAME', kind: 'STRING', nullable: true },
    { name: 'SUBSCRIBED', kind: 'NUMERIC', nullable: false },
    { name: 'LAST_READ_MESSAGE_ID', kind: 'NUMERIC', nullable: true },
    { name: 'UPDATED_DATE_TIME', kind: 'TIMESTAMP', nullable: false },
  ],
} as const satisfies Db2TableSchema;
