import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { config } from 'dotenv';
import { AppModule } from './app.module';

config(); // Load .env before anything else

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function readOrigins(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredOrigins = [
    ...readOrigins('FRONTEND_URL'),
    ...readOrigins('CHECKOUT_FRONTEND_URL'),
  ];
  const allowedOrigins = new Set(
    configuredOrigins.length > 0
      ? configuredOrigins
      : ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:3003'],
  );

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalized = normalizeOrigin(origin);
      const isDevelopmentTunnel =
        process.env.NODE_ENV !== 'production' &&
        /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(normalized);

      if (isDevelopmentTunnel || allowedOrigins.has(normalized)) {
        callback(null, true);
      } else {
        callback(new Error('Origem não permitida pelo CORS'));
      }
    },
    credentials: true,
  });

  // Swagger apenas em desenvolvimento
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AsaasSplit API')
      .setDescription('API para gestão de cobranças e splits de pagamento Asaas')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}`);
}

bootstrap();
