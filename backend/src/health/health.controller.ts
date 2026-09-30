import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Db2Repository } from 'src/database/database.db2.repository';
import { RmqService } from 'src/rmq/rmq.service';

interface HealthResponse {
  isDb2DatabaseConnected: boolean;
  isRmqConnected: boolean;
}

interface LivenessResponse {
  status: 'ok';
}

// Dependency outages are reported in the body, never as non-2xx responses that
// could restart an otherwise healthy process.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly db2: Db2Repository,
    private readonly rmq: RmqService,
  ) {}

  @Get('live')
  @SkipThrottle()
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  @Get()
  @SkipThrottle()
  async check(): Promise<HealthResponse> {
    const isDb2DatabaseConnected = await this.db2.isConnected();
    const isRmqConnected = this.rmq.isConnected();
    return { isDb2DatabaseConnected, isRmqConnected };
  }
}
