import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigurationService } from './platform/configuration/configuration.service';
import { GlobalExceptionFilter } from './platform/errors/global-exception.filter';
import { PlatformLogger } from './platform/logging/platform-logger.service';
import { createServer, type Server as HttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, { bufferLogs: true });
  const configuration = application.get(ConfigurationService);
  const logger = application.get(PlatformLogger);
  application.useLogger(logger);
  application.useGlobalFilters(application.get(GlobalExceptionFilter));
  application.useGlobalPipes(
    new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }),
  );
  // Hide the framework banner header from responses.
  const expressInstance = application.getHttpAdapter().getInstance() as {
    disable: (setting: string) => void;
  };
  expressInstance.disable('x-powered-by');
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
  // The OpenAPI surface is development tooling; it must not be exposed in
  // production where it would disclose the internal API contract.
  if (configuration.values.APP_ENV !== 'production') {
    SwaggerModule.setup(
      'api/docs',
      application,
      SwaggerModule.createDocument(application, openApi),
    );
  }

  await application.listen(configuration.values.API_PORT, '0.0.0.0');
  logger.log(`API listening on port ${String(configuration.values.API_PORT)}`, 'Bootstrap');
  const internalServer = startInternalMtlsIngress(application, configuration);
  if (internalServer) {
    logger.log(
      `Trusted workload mTLS ingress listening on port ${String(configuration.values.INTERNAL_MTLS_PORT)}`,
      'Bootstrap',
    );
  }
}

function startInternalMtlsIngress(
  application: Awaited<ReturnType<typeof NestFactory.create>>,
  configuration: ConfigurationService,
): HttpsServer | undefined {
  const values = configuration.values;
  if (!values.INTERNAL_MTLS_ENABLED) return undefined;
  if (!values.INTERNAL_MTLS_CERT_PATH || !values.INTERNAL_MTLS_KEY_PATH) {
    throw new Error('Internal mTLS is enabled but server certificate/key paths are missing');
  }
  const caPaths = parsePathArray(values.INTERNAL_MTLS_CA_PATHS, 'INTERNAL_MTLS_CA_PATHS');
  if (caPaths.length === 0) throw new Error('Internal mTLS requires at least one trust anchor');
  const crlPaths = parsePathArray(values.INTERNAL_MTLS_CRL_PATHS, 'INTERNAL_MTLS_CRL_PATHS');
  if (values.APP_ENV === 'production' && crlPaths.length === 0) {
    throw new Error('Production internal mTLS requires certificate revocation configuration');
  }
  if (!values.INTERNAL_MTLS_ALLOWED_SAN_SUFFIX || !values.WI1_VERIFICATION_KEYS_PATH) {
    throw new Error('Internal mTLS requires SAN environment binding and WI-1 verification keys');
  }
  const express = application.getHttpAdapter().getInstance() as (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void;
  const server = createServer(
    {
      cert: readFileSync(values.INTERNAL_MTLS_CERT_PATH),
      key: readFileSync(values.INTERNAL_MTLS_KEY_PATH),
      ca: caPaths.map((path) => readFileSync(path)),
      crl: crlPaths.map((path) => readFileSync(path)),
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
    },
    (request, response) => {
      const path = request.url ?? '';
      if (
        !path.startsWith('/api/v1/internal/identities') &&
        !path.startsWith('/api/v1/internal/authorization/identity-readiness') &&
        !path.startsWith('/api/v1/bootstrap/super-admin-identity')
      ) {
        response.writeHead(404).end();
        return;
      }
      express(request, response);
    },
  );
  server.listen(values.INTERNAL_MTLS_PORT, '0.0.0.0');
  const publicServer = application.getHttpServer() as Server;
  publicServer.once('close', () => server.close());
  application.enableShutdownHooks();
  return server;
}

function parsePathArray(value: string, name: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string' || !entry)) {
      throw new Error();
    }
    return parsed as string[];
  } catch {
    throw new Error(`${name} must be a JSON array of file paths`);
  }
}

void bootstrap();
