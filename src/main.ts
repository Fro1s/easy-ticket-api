import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: process.env.APP_URL || 'http://localhost:3000' });

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

  await app.listen(process.env.PORT || 3001);
}
bootstrap();
