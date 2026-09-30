import { createMock } from '@golevelup/ts-jest';
import { ExecutionContext } from '@nestjs/common';

import { HttpThrottlerGuard } from './http-throttler.guard';

describe('HttpThrottlerGuard', () => {
  // shouldSkip is protected; exercise it through a minimal typed accessor.
  const shouldSkip = (guard: HttpThrottlerGuard, context: ExecutionContext) =>
    (
      guard as unknown as {
        shouldSkip(ctx: ExecutionContext): Promise<boolean>;
      }
    ).shouldSkip(context);

  const guard = () =>
    Object.create(HttpThrottlerGuard.prototype) as HttpThrottlerGuard;

  const contextOfType = (type: string) =>
    createMock<ExecutionContext>({ getType: () => type });

  it('does not skip HTTP requests', async () => {
    await expect(shouldSkip(guard(), contextOfType('http'))).resolves.toBe(
      false,
    );
  });

  it('skips non-HTTP contexts (e.g. RMQ message handlers)', async () => {
    await expect(shouldSkip(guard(), contextOfType('rmq'))).resolves.toBe(true);
    await expect(shouldSkip(guard(), contextOfType('ws'))).resolves.toBe(true);
  });
});
