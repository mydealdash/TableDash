import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

export function configureApp(app: import('@nestjs/common').INestApplication) {
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableCors({ origin: (process.env.CORS_ORIGINS ?? '*') === '*' ? true : process.env.CORS_ORIGINS!.split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  return app;
}

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://localhost:${port}/v1`);
}
if (require.main === module) bootstrap();
