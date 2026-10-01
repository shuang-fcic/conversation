import { randomUUID } from 'crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class AccessTokenService {
  /** Mints a UUID v4 customer access token (stored plaintext — R4). */
  mint(): string {
    return randomUUID();
  }
}
