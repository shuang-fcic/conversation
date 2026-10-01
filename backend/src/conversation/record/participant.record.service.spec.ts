import { createMock } from '@golevelup/ts-jest';
import type odbc from 'odbc';

import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';

import { ParticipantRecordService } from './participant.record.service';
describe('ParticipantRecordService', () => {
  const config = { schema: 'MSCONV' } as ReturnType<typeof databaseConfig>;
  it('scopes monotonic read updates to the viewing agent and does not subscribe a viewer', async () => {
    const db = createMock<Db2Repository>();
    const conn = createMock<odbc.Connection>();
    db.queryOne.mockResolvedValue({ ID: 9 });
    await new ParticipantRecordService(db, config).markRead(
      { conversationId: 3, agentId: 'agent-b', messageId: 9 },
      conn,
    );
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('ID = ? AND CONVERSATION_ID = ?'),
      [9, 3],
      conn,
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('T.AGENT_ID = S.AGENT_ID'),
      [3, 'agent-b', 9],
      conn,
    );
    expect(db.query.mock.calls[0][0]).toContain(
      'T.LAST_READ_MESSAGE_ID < S.MESSAGE_ID',
    );
    expect(db.query.mock.calls[0][0]).toContain('0, S.MESSAGE_ID');
  });
  it('ignores a message outside the conversation', async () => {
    const db = createMock<Db2Repository>();
    db.queryOne.mockResolvedValue(null);
    await new ParticipantRecordService(db, config).markRead(
      { conversationId: 3, agentId: 'a', messageId: 100 },
      createMock<odbc.Connection>(),
    );
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'records reply contact and sets subscription only for public=%s',
    async (subscribe) => {
      const db = createMock<Db2Repository>();
      db.queryOne.mockResolvedValue({ ID: 9 });
      const conn = createMock<odbc.Connection>();
      await new ParticipantRecordService(db, config).recordReply(
        {
          conversationId: 3,
          agentId: 'a',
          email: 'a@example.com',
          name: 'A',
          messageId: 9,
          subscribe,
        },
        conn,
      );
      expect(db.query).toHaveBeenLastCalledWith(
        expect.stringContaining('THEN 1 ELSE SUBSCRIBED END'),
        ['a@example.com', 'A', subscribe ? 1 : 0, 3, 'a'],
        conn,
      );
    },
  );
});
