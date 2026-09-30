import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, enabled: boolean) {
  if (!enabled) return;

  const config = new DocumentBuilder()
    .setTitle('Conversations Microservice API')
    .setDescription('The Conversations Microservice API description')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-app-source',
        in: 'header',
        description: 'Source application identifier',
      },
      'x-app-source',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-user-id',
        in: 'header',
        description: 'Optional requesting user ID',
      },
      'x-user-id',
    )
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, documentFactory, {
    customSiteTitle: 'Conversations Microservice API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
}
