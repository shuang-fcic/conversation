import { Db2TableSchema } from 'src/database/database.db2.schema';

export const CONVERSATION_TABLE = {
  table: 'CONVERSATION',
  columns: [
    { name: 'ID', kind: 'NUMERIC', nullable: false },
    { name: 'PUBLIC_ID', kind: 'STRING', nullable: false },
    { name: 'TYPE', kind: 'STRING', nullable: false },
    { name: 'SUBJECT', kind: 'STRING', nullable: false },
    { name: 'STATUS', kind: 'STRING', nullable: false },
    { name: 'WAITING_ON', kind: 'STRING', nullable: true },
    { name: 'CUSTOMER_NAME', kind: 'STRING', nullable: false },
    { name: 'CUSTOMER_EMAIL', kind: 'STRING', nullable: false },
    { name: 'CONTEXT_JSON', kind: 'STRING', nullable: true },
    { name: 'EXTERNAL_REF', kind: 'STRING', nullable: true },
    { name: 'ACCESS_TOKEN', kind: 'STRING', nullable: false },
    { name: 'LATEST_MESSAGE_ID', kind: 'NUMERIC', nullable: true },
    { name: 'CUSTOMER_LAST_READ_MESSAGE_ID', kind: 'NUMERIC', nullable: true },
    { name: 'CREATED_DATE_TIME', kind: 'TIMESTAMP', nullable: false },
    { name: 'UPDATED_DATE_TIME', kind: 'TIMESTAMP', nullable: false },
    { name: 'CREATED_BY', kind: 'STRING', nullable: true },
    { name: 'UPDATED_BY', kind: 'STRING', nullable: true },
  ],
} as const satisfies Db2TableSchema;
