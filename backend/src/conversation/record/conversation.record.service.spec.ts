import { createMock } from '@golevelup/ts-jest';
import type odbc from 'odbc';

import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';

import { ConversationRecordService } from './conversation.record.service';

describe('ConversationRecordService read markers', () => {
  it.each(['CUSTOMER'] as const)(
    'bounds %s reads to the same thread and never moves backwards',
    async (side) => {
      const db = createMock<Db2Repository>();
      const conn = createMock<odbc.Connection>();
      const service = new ConversationRecordService(db, {
        schema: 'MSCONV',
      } as ReturnType<typeof databaseConfig>);
      await service.advanceReadMarker(
        { id: 42, messageId: 9, side, updatedBy: null },
        conn,
      );
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('CUSTOMER_LAST_READ_MESSAGE_ID < ?');
      expect(sql).toContain('M.CONVERSATION_ID = ?');
      expect(sql).toContain('UPDATED_BY = NULL');
      expect(sql.includes("M.VISIBILITY = 'PUBLIC'")).toBe(side === 'CUSTOMER');
      expect(params).toEqual([9, 42, 9, 9, 42]);
    },
  );
});
