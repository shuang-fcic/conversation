import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * A global `APP_GUARD` is also applied to non-HTTP execution contexts — notably
 * golevelup RabbitMQ message handlers, which Nest builds via `ExternalContextCreator`
 * (it concatenates the global guards). `ThrottlerGuard` assumes an HTTP response and
 * calls `res.header(...)` to emit rate-limit headers, so on those contexts it throws
 * `res.header is not a function` before the handler even runs. Rate limiting is an
 * HTTP concern, so skip everything else.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(context.getType() !== 'http');
  }
}
