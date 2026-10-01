import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import odbc from 'odbc';

import {
  Conversation,
  ConversationStatus,
  ConversationType,
  ListConversationsParams,
  WaitingOn,
} from 'src/conversation/conversation.type';
import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';
import { Db2Row, selectColumns } from 'src/database/database.db2.schema';
import {
  toColumnClauses,
  toValuePlaceholders,
} from 'src/database/database.db2.utils';

import { CONVERSATION_TABLE } from './conversation.schema';
import { MESSAGE_TABLE } from './message.schema';

type ConvRow = Db2Row<typeof CONVERSATION_TABLE>;

const COLS = selectColumns(CONVERSATION_TABLE);

/** Params for the initial INSERT — no id/timestamps (DB-stamped). */
export type CreateConversationRecordParams = {
  publicId: string;
  type: ConversationType;
  subject: string;
  status: ConversationStatus;
  waitingOn: WaitingOn | null;
  customerName: string;
  customerEmail: string;
  externalRef: string | null;
  context: Record<string, string>;
  accessToken: string;
  createdBy: string | null;
};

export type UpdateAfterMessageParams = {
  id: number;
  latestMessageId: number;
  /** Advance the author's own read marker so they aren't considered behind. */
  customerLastReadMessageId?: number | null;
  status?: ConversationStatus;
  waitingOn?: WaitingOn | null;
  updatedBy: string | null;
};

export type UpdateStatusParams = {
  id: number;
  status: ConversationStatus;
  waitingOn?: WaitingOn | null;
  updatedBy: string | null;
};

export type AdvanceReadMarkerParams = {
  id: number;
  side: 'CUSTOMER';
  messageId: number;
  updatedBy: string | null;
};

@Injectable()
export class ConversationRecordService {
  constructor(
    private readonly db2: Db2Repository,
    @Inject(databaseConfig.KEY)
    private readonly dbConfig: ConfigType<typeof databaseConfig>,
  ) {}

  private get table(): string {
    return `${this.dbConfig.schema}.${CONVERSATION_TABLE.table}`;
  }

  async findByPublicId(
    publicId: string,
    conn?: odbc.Connection,
  ): Promise<Conversation | null> {
    const row = await this.db2.queryOne<ConvRow>(
      `SELECT ${COLS} FROM ${this.table} WHERE PUBLIC_ID = ?`,
      [publicId],
      conn,
    );
    return row ? this.fromRow(row) : null;
  }

  /**
   * SELECT FOR UPDATE within a transaction — acquires a row lock so concurrent
   * message appends can read-decide-write atomically (R10 notify-until-read).
   */
  async findByPublicIdWithLock(
    publicId: string,
    conn: odbc.Connection,
  ): Promise<Conversation | null> {
    const row = await this.db2.queryOne<ConvRow>(
      `SELECT ${COLS} FROM ${this.table} WHERE PUBLIC_ID = ? FOR UPDATE`,
      [publicId],
      conn,
    );
    return row ? this.fromRow(row) : null;
  }

  async findByAccessToken(
    token: string,
    conn?: odbc.Connection,
  ): Promise<Conversation | null> {
    const row = await this.db2.queryOne<ConvRow>(
      `SELECT ${COLS} FROM ${this.table} WHERE ACCESS_TOKEN = ?`,
      [token],
      conn,
    );
    return row ? this.fromRow(row) : null;
  }

  async findMany(
    params: ListConversationsParams,
    conn?: odbc.Connection,
  ): Promise<Conversation[]> {
    const conditions: string[] = [];
    const queryParams: Array<string | number> = [];

    if (params.status !== undefined) {
      conditions.push('STATUS = ?');
      queryParams.push(params.status);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.db2.query<ConvRow>(
      `SELECT ${COLS} FROM ${this.table} ${where} ORDER BY UPDATED_DATE_TIME DESC FETCH FIRST 200 ROWS ONLY`,
      queryParams,
      conn,
    );
    return Promise.all(rows.map((r) => this.fromRow(r)));
  }

  async create(
    params: CreateConversationRecordParams,
    conn: odbc.Connection,
  ): Promise<Conversation> {
    const { placeholders, params: insertParams } = toValuePlaceholders([
      params.publicId,
      params.type,
      params.subject,
      params.status,
      params.waitingOn,
      params.customerName,
      params.customerEmail,
      params.externalRef,
      JSON.stringify(params.context),
      params.accessToken,
      params.createdBy,
      params.createdBy,
    ]);
    await this.db2.query(
      `INSERT INTO ${this.table}
         (PUBLIC_ID, TYPE, SUBJECT, STATUS, WAITING_ON,
          CUSTOMER_NAME, CUSTOMER_EMAIL, EXTERNAL_REF, CONTEXT_JSON,
          ACCESS_TOKEN, CREATED_BY, UPDATED_BY)
       VALUES (${placeholders})`,
      insertParams,
      conn,
    );

    const row = await this.db2.queryOne<ConvRow>(
      `SELECT ${COLS} FROM ${this.table} WHERE PUBLIC_ID = ?`,
      [params.publicId],
      conn,
    );
    return this.fromRow(row!);
  }

  /** Called atomically with message append — updates denormalized fields + status. */
  async updateAfterMessage(
    params: UpdateAfterMessageParams,
    conn: odbc.Connection,
  ): Promise<void> {
    const mapping: Record<string, string | number | null | undefined> = {
      LATEST_MESSAGE_ID: params.latestMessageId,
      STATUS: params.status,
      WAITING_ON: params.waitingOn,
      UPDATED_BY: params.updatedBy,
    };

    if (params.customerLastReadMessageId !== undefined) {
      mapping.CUSTOMER_LAST_READ_MESSAGE_ID = params.customerLastReadMessageId;
    }
    const { clauses, params: setParams } = toColumnClauses(mapping);
    await this.db2.query(
      `UPDATE ${this.table}
          SET ${clauses.join(', ')}, UPDATED_DATE_TIME = CURRENT_TIMESTAMP
        WHERE ID = ?`,
      [...setParams, params.id],
      conn,
    );
  }

  async updateStatus(
    params: UpdateStatusParams,
    conn: odbc.Connection,
  ): Promise<void> {
    const { clauses, params: setParams } = toColumnClauses({
      STATUS: params.status,
      WAITING_ON: params.waitingOn,
      UPDATED_BY: params.updatedBy,
    });
    await this.db2.query(
      `UPDATE ${this.table}
          SET ${clauses.join(', ')}, UPDATED_DATE_TIME = CURRENT_TIMESTAMP
        WHERE ID = ?`,
      [...setParams, params.id],
      conn,
    );
  }

  async advanceReadMarker(
    params: AdvanceReadMarkerParams,
    conn: odbc.Connection,
  ): Promise<void> {
    const col = 'CUSTOMER_LAST_READ_MESSAGE_ID';
    // A delayed read request cannot move the cursor backwards or mark an unrelated/private post read.
    await this.db2.query(
      `UPDATE ${this.table} SET ${col} = ?, UPDATED_BY = ${params.updatedBy === null ? 'NULL' : '?'}, UPDATED_DATE_TIME = CURRENT_TIMESTAMP
       WHERE ID = ? AND (${col} IS NULL OR ${col} < ?)
       AND EXISTS (SELECT 1 FROM ${this.dbConfig.schema}.${MESSAGE_TABLE.table} M WHERE M.ID = ?
         AND M.CONVERSATION_ID = ? AND M.VISIBILITY = 'PUBLIC')`,
      [
        params.messageId,
        ...(params.updatedBy === null ? [] : [params.updatedBy]),
        params.id,
        params.messageId,
        params.messageId,
        params.id,
      ],
      conn,
    );
  }

  private async fromRow(row: ConvRow): Promise<Conversation> {
    return {
      id: row.ID,
      publicId: row.PUBLIC_ID,
      type: row.TYPE as ConversationType,
      subject: row.SUBJECT,
      status: row.STATUS as ConversationStatus,
      waitingOn: (row.WAITING_ON as WaitingOn) ?? null,
      context: row.CONTEXT_JSON
        ? (JSON.parse(row.CONTEXT_JSON) as Record<string, string>)
        : {},
      customerName: row.CUSTOMER_NAME,
      customerEmail: row.CUSTOMER_EMAIL,
      externalRef: row.EXTERNAL_REF,
      accessToken: row.ACCESS_TOKEN,
      latestMessageId: row.LATEST_MESSAGE_ID,
      customerLastReadMessageId: row.CUSTOMER_LAST_READ_MESSAGE_ID,
      createdAt: await this.db2.fromDb2Timestamp(row.CREATED_DATE_TIME),
      updatedAt: await this.db2.fromDb2Timestamp(row.UPDATED_DATE_TIME),
      createdBy: row.CREATED_BY,
      updatedBy: row.UPDATED_BY,
    };
  }
}
