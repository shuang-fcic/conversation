import { createMock } from '@golevelup/ts-jest';

import { AuthorType } from 'src/conversation/conversation.type';
import { databaseConfig } from 'src/database/database.config';
import { Db2Repository } from 'src/database/database.db2.repository';

import { MessageRecordService } from './message.record.service';

describe('MessageRecordService unread query', () => {
  it('counts only public posts from the other party, excluding opening records and private notes', async () => {
    const db = createMock<Db2Repository>();
    const service = new MessageRecordService(db, {
      schema: 'MSCONV',
    } as ReturnType<typeof databaseConfig>);
    db.queryOne.mockResolvedValue(null);
    await expect(
      service.hasUnread({
        conversationId: 42,
        authorType: AuthorType.AGENT,
        lastReadId: 5,
      }),
    ).resolves.toBe(false);
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringContaining('VISIBILITY = ? AND ID > ?'),
      [42, AuthorType.AGENT, 'PUBLIC', 5],
      undefined,
    );
    db.queryOne.mockResolvedValue({ ID: 7 });
    await expect(
      service.hasUnread({
        conversationId: 42,
        authorType: AuthorType.AGENT,
        lastReadId: 5,
      }),
    ).resolves.toBe(true);
  });
});
