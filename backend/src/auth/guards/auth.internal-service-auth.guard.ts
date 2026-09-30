import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ALLOWED_APP_SOURCES_KEY } from 'src/auth/decorators/auth.internal-service.controller.decorator';
import { InternalServiceRequest } from 'src/auth/interfaces/auth.internal-service-request.interface';

@Injectable()
export class InternalServiceAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private checkIsAllowedAppSources(
    context: ExecutionContext,
    appSource: string,
  ) {
    const allowedSources = this.reflector.getAllAndOverride<string[]>(
      ALLOWED_APP_SOURCES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowedSources || allowedSources.length === 0) {
      return false;
    }

    return allowedSources.includes(appSource);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<InternalServiceRequest>();

    const appSource = req.headers['x-app-source'] as string | undefined;
    if (!appSource) {
      throw new UnauthorizedException('Missing x-app-source header.');
    }

    req.appSource = appSource;
    req.userId = req.headers['x-user-id'] as string | undefined;

    return this.checkIsAllowedAppSources(context, appSource);
  }
}
