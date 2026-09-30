import { createMock } from '@golevelup/ts-jest';
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { AlertService } from 'src/alerting/alert.service';

import { UnhandledExceptionAlertFilter } from './unhandled-exception.filter';

describe('UnhandledExceptionAlertFilter', () => {
  let alerts: jest.Mocked<AlertService>;
  let adapter: {
    reply: jest.Mock;
    isHeadersSent: jest.Mock;
    end: jest.Mock;
  };

  const host = (request: object): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => undefined,
      }),
      getType: () => 'http',
      getArgs: () => [],
      getArgByIndex: (index: number) => (index === 1 ? {} : undefined),
      switchToRpc: () => undefined,
      switchToWs: () => undefined,
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    alerts = createMock<AlertService>();
    adapter = {
      reply: jest.fn(),
      isHeadersSent: jest.fn().mockReturnValue(false),
      end: jest.fn(),
    };
  });

  const filter = () =>
    new UnhandledExceptionAlertFilter(
      { httpAdapter: adapter } as unknown as HttpAdapterHost,
      alerts,
    );

  it('does not alert for client errors and preserves the HTTP response', () => {
    filter().catch(
      new BadRequestException('invalid input'),
      host({ method: 'POST', route: { path: '/messages' } }),
    );

    expect(alerts.error).not.toHaveBeenCalled();
    expect(adapter.reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('alerts on explicit 5xx errors using the route pattern, never the raw id', () => {
    const exception = new HttpException(
      'upstream failed',
      HttpStatus.BAD_GATEWAY,
    );

    filter().catch(
      exception,
      host({
        method: 'GET',
        url: '/messages/private-customer-id?include=data',
        route: { path: '/messages/:id' },
      }),
    );

    const context = {
      method: 'GET',
      path: '/messages/:id',
      status: HttpStatus.BAD_GATEWAY,
      err: 'upstream failed',
    };
    expect(alerts.error).toHaveBeenCalledWith(
      context,
      'HTTP 502 GET /messages/:id',
    );
    expect(JSON.stringify(alerts.error.mock.calls)).not.toContain(
      'private-customer-id',
    );
  });

  it('maps unknown failures to 500 and falls back to the URL path', () => {
    filter().catch(
      new Error('boom'),
      host({ method: 'DELETE', url: '/messages/failed?token=secret' }),
    );

    expect(alerts.error).toHaveBeenCalledWith(
      {
        method: 'DELETE',
        path: '/messages/failed',
        status: 500,
        err: 'boom',
      },
      'HTTP 500 DELETE /messages/failed',
    );
  });

  it('rethrows for non-HTTP contexts without touching the HTTP response', () => {
    const rpcHost = {
      getType: () => 'rmq',
      switchToHttp: () => ({
        getRequest: () => undefined,
        getResponse: () => undefined,
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;
    const exception = new Error('consumer blew up');

    expect(() => filter().catch(exception, rpcHost)).toThrow(exception);

    expect(adapter.reply).not.toHaveBeenCalled();
    expect(alerts.error).toHaveBeenCalledWith(
      { contextType: 'rmq', err: 'consumer blew up' },
      'Unhandled rmq exception',
    );
  });
});
