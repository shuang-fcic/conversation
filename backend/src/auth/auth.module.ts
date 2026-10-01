import { Module } from '@nestjs/common';

import { InternalServiceAuthGuard } from './guards/auth.internal-service-auth.guard';
@Module({
  providers: [InternalServiceAuthGuard],
  exports: [InternalServiceAuthGuard],
})
export class AuthModule {}
