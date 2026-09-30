import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

import { getFormattedValidationErrors } from 'src/common/utils/error.util';

const exceptionFactory = (errors: ValidationError[]) => {
  const formattedErrors = getFormattedValidationErrors(errors);

  const res = {
    error: 'Bad Request',
    message: formattedErrors,
    statusCode: 400,
  };

  throw new BadRequestException(res);
};

export const ValidationPipeGlobal = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  exceptionFactory,
});
