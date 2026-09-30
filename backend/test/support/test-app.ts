import { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { useContainer } from 'class-validator';

import { ValidationPipeGlobal } from 'src/common/pipes/validation.pipe';

/** Boots a focused HTTP-boundary app while mirroring main.ts global validation. */
export async function createTestApp(
  metadata: ModuleMetadata,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule(metadata).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(ValidationPipeGlobal);
  // Focused modules have no AppModule to select for class-validator's DI bridge.
  useContainer(app, { fallbackOnErrors: true });
  await app.init();

  return app;
}
