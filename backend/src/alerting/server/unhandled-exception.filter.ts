import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';

import { AlertService } from 'src/alerting/alert.service';

@Catch()
export class UnhandledExceptionAlertFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(UnhandledExceptionAlertFilter.name);

  constructor(
    httpAdapterHost: HttpAdapterHost,
    private readonly alerts: AlertService,
  ) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // Global APP_FILTERs also wrap non-HTTP contexts (e.g. golevelup RMQ message
    // handlers run through Nest's ExternalContextCreator). BaseExceptionFilter
    // assumes an HTTP response, so calling super.catch there fails with
    // "res.header is not a function" and masks the real error. Alert with the
    // right context and rethrow so the transport's own handling (RMQ NACK →
    // dead-letter) takes over.
    if (host.getType() !== 'http') {
      const context = {
        contextType: host.getType(),
        err: exception instanceof Error ? exception.message : 'Unknown error',
      };
      const title = `Unhandled ${host.getType()} exception`;
      this.logger.error(context, title);
      this.alerts.error(context, title);
      throw exception;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const request = host.switchToHttp().getRequest<{
        method?: string;
        url?: string;
        route?: { path?: string };
      }>();
      const method = request?.method ?? 'UNKNOWN';
      // Prefer the route pattern to keep IDs/PII out and alert-throttle keys bounded.
      const route =
        request?.route?.path ?? request?.url?.split('?')[0] ?? 'unknown';
      const context = {
        method,
        path: route,
        status,
        err: exception instanceof Error ? exception.message : 'Unknown error',
      };
      const title = `HTTP ${status} ${method} ${route}`;
      this.logger.error(context, title);
      this.alerts.error(context, title);
    }
    super.catch(exception, host);
  }
}
