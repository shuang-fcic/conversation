import { createMock } from '@golevelup/ts-jest';

import { AlertService } from 'src/alerting/alert.service';

import { registerProcessAlertHandlers } from './process-alert-handlers';

describe('registerProcessAlertHandlers', () => {
  it.each([
    ['uncaughtException', new Error('boom'), 'Uncaught exception', 'boom'],
    [
      'unhandledRejection',
      'rejected',
      'Unhandled promise rejection',
      'rejected',
    ],
  ] as const)(
    'alerts, flushes, and exits for %s',
    async (event, reason, title, message) => {
      const alerts = createMock<AlertService>();
      alerts.flush.mockResolvedValue(undefined);
      const handlers = new Map<string, (...args: never[]) => void>();
      jest.spyOn(process, 'on').mockImplementation(((
        name: string,
        handler: (...args: never[]) => void,
      ) => {
        handlers.set(name, handler);
        return process;
      }) as typeof process.on);
      const exit = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      registerProcessAlertHandlers(alerts);

      handlers.get(event)?.(reason as never);
      await Promise.resolve();
      await Promise.resolve();

      expect(alerts.fatal).toHaveBeenCalledWith({ err: message }, title);
      expect(alerts.flush).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
    },
  );
});
