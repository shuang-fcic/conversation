import { Global, Module } from '@nestjs/common';

import { Db2Repository } from './database.db2.repository';

@Global()
@Module({
  providers: [Db2Repository],
  exports: [Db2Repository],
})
export class DatabaseModule {}
