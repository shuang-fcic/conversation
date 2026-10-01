import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import odbc from 'odbc';

import {
  AuthorType,
  Message,
  MessageVisibility,
} from 'src/conversation/conversation.type';
import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';
import { Db2Row, selectColumns } from 'src/database/database.db2.schema';
import { toValuePlaceholders } from 'src/database/database.db2.utils';

import { MESSAGE_TABLE } from './message.schema';
import { PARTICIPANT_TABLE } from './participant.schema';

type MsgRow = Db2Row<typeof MESSAGE_TABLE> & { AUTHOR_NAME?: string | null };

const COLS = selectColumns(MESSAGE_TABLE);

export type AppendMessageParams = {
  conversationId: number;
  authorType: AuthorType;
  authorId: string | null;
  bodyJson: Record<string, unknown>;
  visibility: MessageVisibility;
  createdBy: string | null;
};

@Injectable()
export class MessageRecordService {
  constructor(
    private readonly db2: Db2Repository,
    @Inject(databaseConfig.KEY)
    private readonly dbConfig: ConfigType<typeof databaseConfig>,
  ) {}

  private get table(): string {
    return `${this.dbConfig.schema}.${MESSAGE_TABLE.table}`;
  }

  async append(
    params: AppendMessageParams,
    conn: odbc.Connection,
  ): Promise<Message> {
    const { placeholders, params: insertParams } = toValuePlaceholders([
      params.conversationId,
      params.authorType,
      params.authorId,
      JSON.stringify(params.bodyJson),
      params.visibility,
      params.createdBy,
    ]);
    await this.db2.query(
      `INSERT INTO ${this.table}
         (CONVERSATION_ID, AUTHOR_TYPE, AUTHOR_ID, BODY_JSON, VISIBILITY, CREATED_BY)
       VALUES (${placeholders})`,
      insertParams,
      conn,
    );

    const row = await this.db2.queryOne<MsgRow>(
      `SELECT ${COLS} FROM ${this.table}
        WHERE CONVERSATION_ID = ?
        ORDER BY ID DESC
        FETCH FIRST 1 ROW ONLY`,
      [params.conversationId],
      conn,
    );
    return this.fromRow(row!);
  }

  async listByConversation(
    params: {
      conversationId: number;
      visibilities?: MessageVisibility[];
    },
    conn?: odbc.Connection,
  ): Promise<Message[]> {
    const { conversationId, visibilities } = params;
    const columns = MESSAGE_TABLE.columns
      .map((column) => `M.${column.name}`)
      .join(', ');
    const visibilityClause = visibilities?.length
      ? `AND M.VISIBILITY IN (${visibilities.map(() => '?').join(', ')})`
      : '';
    const sql = `SELECT ${columns}, P.NAME AS AUTHOR_NAME FROM ${this.table} M
      LEFT JOIN ${this.dbConfig.schema}.${PARTICIPANT_TABLE.table} P
      ON P.CONVERSATION_ID = M.CONVERSATION_ID AND P.AGENT_ID = M.AUTHOR_ID AND M.AUTHOR_TYPE = 'AGENT'
      WHERE M.CONVERSATION_ID = ? ${visibilityClause} ORDER BY M.ID ASC`;
    const queryParams: Array<string | number> = [
      conversationId,
      ...(visibilities ?? []),
    ];

    const rows = await this.db2.query<MsgRow>(sql, queryParams, conn);
    return Promise.all(rows.map((r) => this.fromRow(r)));
  }

  async hasUnread(
    params: {
      conversationId: number;
      authorType: AuthorType;
      lastReadId: number | null;
    },
    conn?: odbc.Connection,
  ): Promise<boolean> {
    const row = await this.db2.queryOne<{ ID: number }>(
      `SELECT ID FROM ${this.table} WHERE CONVERSATION_ID = ? AND AUTHOR_TYPE = ?
       AND VISIBILITY = ? AND ID > ? FETCH FIRST 1 ROW ONLY`,
      [
        params.conversationId,
        params.authorType,
        MessageVisibility.PUBLIC,
        params.lastReadId ?? 0,
      ],
      conn,
    );
    return row !== null && row !== undefined;
  }

  private async fromRow(row: MsgRow): Promise<Message> {
    return {
      id: row.ID,
      conversationId: row.CONVERSATION_ID,
      authorType: row.AUTHOR_TYPE as AuthorType,
      authorId: row.AUTHOR_ID,
      authorName: row.AUTHOR_NAME ?? null,
      bodyJson: JSON.parse(row.BODY_JSON) as Record<string, unknown>,
      visibility: row.VISIBILITY as MessageVisibility,
      createdAt: await this.db2.fromDb2Timestamp(row.CREATED_DATE_TIME),
      createdBy: row.CREATED_BY,
    };
  }
}
