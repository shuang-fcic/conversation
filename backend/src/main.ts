import { type ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { useContainer } from 'class-validator';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';

import { AlertService } from './alerting/alert.service';
import { registerProcessAlertHandlers } from './alerting/server/process-alert-handlers';
import { AppModule } from './app.module';
import { appConfig } from './common/config/app.config';
import { ValidationPipeGlobal } from './common/pipes/validation.pipe';
import { setupCors } from './common/setup/cors.setup';
import { setupSwagger } from './common/setup/swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    bodyParser: false,
  });

  // Raised for rich-text message bodies and attachments.
  app.useBodyParser('json', { limit: '20mb' });

  app.useLogger(app.get(Logger));

  app.enableShutdownHooks();

  registerProcessAlertHandlers(app.get(AlertService));

  app.useGlobalPipes(ValidationPipeGlobal);

  app.use(cookieParser());

  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  setupSwagger(app, config.swaggerEnabled);

  setupCors(app, config.isProduction);

  await app.listen(config.port);
}

void bootstrap();
