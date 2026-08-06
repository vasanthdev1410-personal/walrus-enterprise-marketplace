import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigurationService } from './platform/configuration/configuration.service';
import { GlobalExceptionFilter } from './platform/errors/global-exception.filter';
import { PlatformLogger } from './platform/logging/platform-logger.service';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuration = application.get(ConfigurationService);
  const logger = application.get(PlatformLogger);
  application.useLogger(logger);
  application.useGlobalFilters(application.get(GlobalExceptionFilter));
  application.useGlobalPipes(
    new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }),
  );
  application.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready', 'metrics'],
  });
  application.enableShutdownHooks();

  const openApi = new DocumentBuilder()
    .setTitle('WALRUS Platform API')
    .setDescription('WALRUS operational and Module 01 Identity & Authentication API.')
    .setVersion('1.0.0')
    .addServer('/api/v1')
    .build();
  SwaggerModule.setup('api/docs', application, SwaggerModule.createDocument(application, openApi));

  await application.listen(configuration.values.API_PORT, '0.0.0.0');
  logger.log(`API listening on port ${String(configuration.values.API_PORT)}`, 'Bootstrap');
}

void bootstrap();
