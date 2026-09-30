import { createMock } from '@golevelup/ts-jest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { APP_SOURCE } from 'src/auth/constants/auth.app-source.constant';
import { InternalServiceRequest } from 'src/auth/interfaces/auth.internal-service-request.interface';

import { InternalServiceAuthGuard } from './auth.internal-service-auth.guard';

describe('InternalServiceAuthGuard', () => {
  let guard: InternalServiceAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = createMock<Reflector>();
    guard = new InternalServiceAuthGuard(reflector);
  });

  function contextFor(headers: Record<string, string | undefined>): {
    context: ExecutionContext;
    req: InternalServiceRequest;
  } {
    const req = { headers } as unknown as InternalServiceRequest;
    const context = createMock<ExecutionContext>({
      switchToHttp: () =>
        createMock<ReturnType<ExecutionContext['switchToHttp']>>({
          getRequest: () => req,
        }),
    });
    return { context, req };
  }

  it('throws Unauthorized when x-app-source is missing', () => {
    reflector.getAllAndOverride.mockReturnValue([APP_SOURCE.RC_NEXT]);
    const { context } = contextFor({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('denies (false) when the source is not on the whitelist', () => {
    reflector.getAllAndOverride.mockReturnValue([APP_SOURCE.RC_NEXT]);
    const { context } = contextFor({ 'x-app-source': APP_SOURCE.MS_MESSAGING });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('denies when no whitelist is set on the route (deny-all default)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const { context } = contextFor({ 'x-app-source': APP_SOURCE.RC_NEXT });

    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows a whitelisted source and threads app source + user id onto the request', () => {
    reflector.getAllAndOverride.mockReturnValue([
      APP_SOURCE.RC_NEXT,
      APP_SOURCE.MS_MESSAGING,
    ]);
    const { context, req } = contextFor({
      'x-app-source': APP_SOURCE.RC_NEXT,
      'x-user-id': 'user-123',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(req.appSource).toBe(APP_SOURCE.RC_NEXT);
    expect(req.userId).toBe('user-123');
  });

  it('leaves userId undefined when x-user-id is absent', () => {
    reflector.getAllAndOverride.mockReturnValue([APP_SOURCE.RC_NEXT]);
    const { context, req } = contextFor({ 'x-app-source': APP_SOURCE.RC_NEXT });

    expect(guard.canActivate(context)).toBe(true);
    expect(req.userId).toBeUndefined();
  });
});
