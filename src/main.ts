import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const corsOrigins = (process.env.CORS_ORIGINS ?? process.env.APP_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Easy Ticket API')
    .setDescription('Brazilian event ticket platform — lowest fee on the market')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, () => document, {
    jsonDocumentUrl: 'docs/json',
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] listening on 0.0.0.0:${port}`);
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] failed to start:', err);
  process.exit(1);
});
