import { ConsoleLogger } from '@nestjs/common';

import { CliLogger } from 'src/scripts/cli.logger';

describe('CliLogger', () => {
  // super.error resolves to ConsoleLogger.prototype.error, so spying it here
  // intercepts exactly what CliLogger.error forwards (or drops).
  let superError: jest.SpyInstance;
  let logger: CliLogger;

  beforeEach(() => {
    superError = jest
      .spyOn(ConsoleLogger.prototype, 'error')
      .mockImplementation();
    logger = new CliLogger({ logLevels: ['error', 'fatal'] });
  });

  it('drops AmqpConnection errors once shutting down', () => {
    logger.shuttingDown = true;

    logger.error(
      'Failed to setup a RabbitMQ channel',
      'stack',
      'AmqpConnection',
    );

    expect(superError).not.toHaveBeenCalled();
  });

  it('still logs AmqpConnection errors before shutdown', () => {
    logger.error(
      'Disconnected from RabbitMQ broker',
      'stack',
      'AmqpConnection',
    );

    expect(superError).toHaveBeenCalledWith(
      'Disconnected from RabbitMQ broker',
      'stack',
      'AmqpConnection',
    );
  });

  it('still logs non-AmqpConnection errors during shutdown', () => {
    logger.shuttingDown = true;

    logger.error('boom', 'stack', 'MessageService');

    expect(superError).toHaveBeenCalledWith('boom', 'stack', 'MessageService');
  });
});
