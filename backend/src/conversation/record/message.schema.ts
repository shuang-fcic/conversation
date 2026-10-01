import { Db2TableSchema } from 'src/database/database.db2.schema';

export const MESSAGE_TABLE = {
  table: 'MESSAGE',
  columns: [
    { name: 'ID', kind: 'NUMERIC', nullable: false },
    { name: 'CONVERSATION_ID', kind: 'NUMERIC', nullable: false },
    { name: 'AUTHOR_TYPE', kind: 'STRING', nullable: false },
    { name: 'AUTHOR_ID', kind: 'STRING', nullable: true },
    { name: 'BODY_JSON', kind: 'STRING', nullable: false },
    { name: 'VISIBILITY', kind: 'STRING', nullable: false },
    { name: 'CREATED_DATE_TIME', kind: 'TIMESTAMP', nullable: false },
    { name: 'CREATED_BY', kind: 'STRING', nullable: true },
  ],
} as const satisfies Db2TableSchema;
