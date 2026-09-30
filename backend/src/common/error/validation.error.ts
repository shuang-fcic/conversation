import { ValidationError } from 'class-validator';

import { getFormattedValidationErrors } from 'src/common/utils/error.util';

export const NESTED_ERROR_PREFIX = '__NESTED_VALIDATION__';

export class NestedValidationError extends Error {
  constructor(
    message: string,
    protected readonly validationErrors: ValidationError[],
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  public toValidationMessage(): string {
    const formatted = getFormattedValidationErrors(this.validationErrors);
    return `${NESTED_ERROR_PREFIX}${JSON.stringify(formatted)}`;
  }
}
