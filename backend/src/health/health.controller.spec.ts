import { createMock } from '@golevelup/ts-jest';

import { Db2Repository } from 'src/database/database.db2.repository';
import { RmqService } from 'src/rmq/rmq.service';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let db2: jest.Mocked<Db2Repository>;
  let rmq: jest.Mocked<RmqService>;

  beforeEach(() => {
    db2 = createMock<Db2Repository>();
    rmq = createMock<RmqService>();
    controller = new HealthController(db2, rmq);
  });

  describe('live', () => {
    it('reports ok', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
    });

    it('touches no dependencies', () => {
      controller.live();
      expect(db2.isConnected).not.toHaveBeenCalled();
      expect(rmq.isConnected).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('reports both dependencies up', async () => {
      db2.isConnected.mockResolvedValue(true);
      rmq.isConnected.mockReturnValue(true);

      await expect(controller.check()).resolves.toEqual({
        isDb2DatabaseConnected: true,
        isRmqConnected: true,
      });
    });

    it('reports connectivity per dependency', async () => {
      db2.isConnected.mockResolvedValue(false);
      rmq.isConnected.mockReturnValue(true);

      await expect(controller.check()).resolves.toEqual({
        isDb2DatabaseConnected: false,
        isRmqConnected: true,
      });
    });

    it('resolves even when both dependencies are down', async () => {
      db2.isConnected.mockResolvedValue(false);
      rmq.isConnected.mockReturnValue(false);

      await expect(controller.check()).resolves.toEqual({
        isDb2DatabaseConnected: false,
        isRmqConnected: false,
      });
    });
  });
});
