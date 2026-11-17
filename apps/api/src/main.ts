import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// The repository keeps one .env at the root; support both the compiled and ts-node layouts.
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(process.cwd(), '.env'), override: false });

import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, '0.0.0.0');
  console.log(
    `Rumindium Invoice API listening on ${env.PUBLIC_ORIGIN.replace(/:\d+$/, '')}:${env.API_PORT}/api/v1`,
  );
}

void bootstrap();
