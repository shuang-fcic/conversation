import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import type odbc from 'odbc';

import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';
import { Db2Row, selectColumns } from 'src/database/database.db2.schema';

import { MESSAGE_TABLE } from './message.schema';
import { PARTICIPANT_TABLE } from './participant.schema';
export type AgentRecipient = {
  agentId: string;
  email: string;
  name: string;
  lastReadId: number | null;
};
@Injectable()
export class ParticipantRecordService {
  constructor(
    private readonly db: Db2Repository,
    @Inject(databaseConfig.KEY)
    private readonly config: ConfigType<typeof databaseConfig>,
  ) {}
  private get table() {
    return `${this.config.schema}.${PARTICIPANT_TABLE.table}`;
  }
  async lastRead(params: {
    conversationId: number;
    agentId: string;
  }): Promise<number | null> {
    const row = await this.db.queryOne<{ LAST_READ_MESSAGE_ID: number | null }>(
      `SELECT LAST_READ_MESSAGE_ID FROM ${this.table} WHERE CONVERSATION_ID = ? AND AGENT_ID = ?`,
      [params.conversationId, params.agentId],
    );
    return row?.LAST_READ_MESSAGE_ID ?? null;
  }
  async subscribers(
    conversationId: number,
    conn: odbc.Connection,
  ): Promise<AgentRecipient[]> {
    const rows = await this.db.query<Db2Row<typeof PARTICIPANT_TABLE>>(
      `SELECT ${selectColumns(PARTICIPANT_TABLE)} FROM ${this.table} WHERE CONVERSATION_ID = ? AND SUBSCRIBED = 1 AND EMAIL IS NOT NULL`,
      [conversationId],
      conn,
    );
    return rows.map((r) => ({
      agentId: r.AGENT_ID,
      email: r.EMAIL!,
      name: r.NAME || r.AGENT_ID,
      lastReadId: r.LAST_READ_MESSAGE_ID,
    }));
  }
  // All mutations run under the parent conversation row lock.
  async markRead(
    params: { conversationId: number; agentId: string; messageId: number },
    conn: odbc.Connection,
  ): Promise<void> {
    const message = await this.db.queryOne<{ ID: number }>(
      `SELECT ID FROM ${this.config.schema}.${MESSAGE_TABLE.table} WHERE ID = ? AND CONVERSATION_ID = ?`,
      [params.messageId, params.conversationId],
      conn,
    );
    if (!message) return;
    await this.db.query(
      `MERGE INTO ${this.table} T USING (VALUES (CAST(? AS INTEGER), CAST(? AS VARCHAR(255)), CAST(? AS INTEGER))) S (CONVERSATION_ID, AGENT_ID, MESSAGE_ID)
      ON T.CONVERSATION_ID = S.CONVERSATION_ID AND T.AGENT_ID = S.AGENT_ID
      WHEN MATCHED THEN UPDATE SET LAST_READ_MESSAGE_ID = CASE WHEN T.LAST_READ_MESSAGE_ID IS NULL OR T.LAST_READ_MESSAGE_ID < S.MESSAGE_ID THEN S.MESSAGE_ID ELSE T.LAST_READ_MESSAGE_ID END, UPDATED_DATE_TIME = CURRENT_TIMESTAMP
      WHEN NOT MATCHED THEN INSERT (CONVERSATION_ID, AGENT_ID, SUBSCRIBED, LAST_READ_MESSAGE_ID) VALUES (S.CONVERSATION_ID, S.AGENT_ID, 0, S.MESSAGE_ID)`,
      [params.conversationId, params.agentId, params.messageId],
      conn,
    );
  }
  async recordReply(
    params: {
      conversationId: number;
      agentId: string;
      email: string;
      name: string;
      messageId: number;
      subscribe: boolean;
    },
    conn: odbc.Connection,
  ): Promise<void> {
    await this.markRead(params, conn);
    await this.db.query(
      `UPDATE ${this.table} SET EMAIL = ?, NAME = ?, SUBSCRIBED = CASE WHEN ? = 1 THEN 1 ELSE SUBSCRIBED END, UPDATED_DATE_TIME = CURRENT_TIMESTAMP WHERE CONVERSATION_ID = ? AND AGENT_ID = ?`,
      [
        params.email,
        params.name,
        params.subscribe ? 1 : 0,
        params.conversationId,
        params.agentId,
      ],
      conn,
    );
  }
}
