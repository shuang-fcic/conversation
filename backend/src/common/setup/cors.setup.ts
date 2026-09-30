import { INestApplication } from '@nestjs/common';

const ORIGINS_DEV = true;

const ORIGINS_PROD = '*';

// Permissive by design while the service is firewall-restricted; revisit before public exposure.
export function setupCors(app: INestApplication, isProduction: boolean) {
  app.enableCors({
    origin: isProduction ? ORIGINS_PROD : ORIGINS_DEV,
    credentials: true,
  });
}
