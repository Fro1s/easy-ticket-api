import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Refuse to boot in production with weak/placeholder auth secrets. Prevents
 * the "copied .env.example and forgot to rotate" failure mode that would let
 * anyone forge JWTs (incl. admin) or spoof the payment webhook.
 */
function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'QR_SECRET',
    'ABACATEPAY_WEBHOOK_SECRET',
  ];
  const problems: string[] = [];
  for (const key of required) {
    const value = process.env[key]?.trim();
    const lower = value?.toLowerCase() ?? '';
    if (!value) problems.push(`${key} is not set`);
    else if (
      ['change-me', 'dev-only', 'insecure', 'placeholder'].some((m) =>
        lower.includes(m),
      )
    )
      problems.push(`${key} is a known dev/placeholder value`);
    else if (value.length < 16)
      problems.push(`${key} is too short (min 16 chars)`);
  }
  if (problems.length) {
    throw new Error(
      `Refusing to start in production with insecure secrets:\n- ${problems.join('\n- ')}\nGenerate strong values, e.g. \`openssl rand -base64 48\`.`,
    );
  }
}

async function bootstrap() {
  assertProductionSecrets();

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Behind Fly.io's reverse proxy: trust the first proxy hop so req.ip is the
  // real client, not the proxy — otherwise IP rate-limiting buckets every
  // buyer together and wrongly 429s them during a sale.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(helmet());
  // `health` sits outside the version prefix so the Fly http check and any
  // external uptime monitor point at a stable `/health`, unaffected by a
  // future `api/v2`.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/db'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    process.env.APP_URL ??
    'http://localhost:3000'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Swagger é exposto apenas fora de produção (ou quando SWAGGER_ENABLED=true),
  // para não publicar a superfície da API e o schema em prod por padrão.
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Easy Ticket API')
      .setDescription(
        'Brazilian event ticket platform — lowest fee on the market',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, () => document, {
      jsonDocumentUrl: 'docs/json',
    });
  }

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  console.log(`[bootstrap] listening on 0.0.0.0:${port}`);
}
bootstrap().catch((err) => {
  console.error('[bootstrap] failed to start:', err);
  process.exit(1);
});
