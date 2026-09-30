import { formatErrorDetails } from 'src/common/utils/error.util';

export abstract class DomainError extends Error {
  constructor(
    public readonly publicMessage: string,
    protected readonly options: object = {},
  ) {
    super(`${publicMessage}${formatErrorDetails(options)}`);
    this.name = this.constructor.name;
  }
}
