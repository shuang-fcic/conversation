import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import type { InternalServiceRequest } from 'src/auth/interfaces/auth.internal-service-request.interface';

export const AppSource = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<InternalServiceRequest>();

    const appSource = req.appSource;
    if (!appSource) {
      console.error('@AppSource() used without InternalServiceGuard.');
      throw new InternalServerErrorException();
    }

    return appSource;
  },
);

export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<InternalServiceRequest>();

    return req.userId ?? null;
  },
);
