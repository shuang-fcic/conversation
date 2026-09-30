import { ValidationError } from '@nestjs/common';

import { NESTED_ERROR_PREFIX } from 'src/common/error/validation.error';

type FormattedError = Record<string, string[]>;

interface AddErrorParams {
  formattedErrors: FormattedError;
  property: string;
  message: string;
}

interface AddNestedErrorsParams {
  formattedErrors: FormattedError;
  parentProperty: string;
  nested: FormattedError;
}

export function formatErrorDetails(options: object): string {
  const parts = Object.entries(options)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? ` - ${parts.join(', ')}` : '';
}

function isNestedValidationMessage(message: string): boolean {
  return message.startsWith(NESTED_ERROR_PREFIX);
}

function parseNestedErrors(message: string): FormattedError | null {
  if (!isNestedValidationMessage(message)) {
    return null;
  }

  return JSON.parse(
    message.slice(NESTED_ERROR_PREFIX.length),
  ) as FormattedError;
}

function addError(params: AddErrorParams) {
  const { formattedErrors, property, message } = params;
  if (!formattedErrors[property]) {
    formattedErrors[property] = [];
  }
  formattedErrors[property].push(message);
}

function addNestedErrors(params: AddNestedErrorsParams) {
  const { formattedErrors, parentProperty, nested } = params;
  Object.entries(nested).forEach(([nestedProp, messages]) => {
    const fullPath = `${parentProperty}.${nestedProp}`;
    formattedErrors[fullPath] = messages;
  });
}

export function getFormattedValidationErrors(
  errors: ValidationError[],
): FormattedError {
  const formattedErrors: FormattedError = {};

  const formatErrors = (errors: ValidationError[], prefix = '') => {
    errors.forEach((error) => {
      const property = prefix ? `${prefix}.${error.property}` : error.property;

      if (error.constraints) {
        Object.values(error.constraints).forEach((message) => {
          if (isNestedValidationMessage(message)) {
            const nested = parseNestedErrors(message);
            if (nested) {
              addNestedErrors({
                formattedErrors,
                parentProperty: property,
                nested,
              });
              return;
            }
          }
          addError({ formattedErrors, property, message });
        });
      }

      if (error.children && error.children.length > 0) {
        formatErrors(error.children, property);
      }
    });
  };

  formatErrors(errors);
  return formattedErrors;
}
