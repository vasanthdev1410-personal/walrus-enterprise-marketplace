import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('platform health (integration)', () => {
  let app: INestApplication;
  let keyDirectory: string;

  beforeAll(async () => {
    process.env.DATABASE_PASSWORD = 'local-password';
    process.env.DATABASE_URL = 'postgresql://walrus:local-password@localhost:5432/walrus';
    process.env.REDIS_PASSWORD = 'local-password';
    keyDirectory = mkdtempSync(join(tmpdir(), 'walrus-module-01-test-'));
    configureModule01TestKeys(keyDirectory);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(keyDirectory, { recursive: true, force: true });
  });

  it('GET /health', async () => {
    const server = app.getHttpServer() as Server;
    await request(server)
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: unknown }) => {
        expect(body).toMatchObject({ status: 'UP', service: 'api' });
      });
  });
});

function configureModule01TestKeys(directory: string): void {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privatePath = join(directory, 'jwt-private.pem');
  const publicPath = join(directory, 'jwt-public.pem');
  writeFileSync(privatePath, pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
  writeFileSync(publicPath, pair.publicKey.export({ format: 'pem', type: 'spki' }));
  process.env.JWT_ISSUER = 'https://identity.test.walrus.invalid';
  process.env.JWT_AUDIENCE = 'walrus-test';
  process.env.JWT_SIGNING_KEY_ID = 'test-jwt-v1';
  process.env.JWT_SIGNING_KEY_REFERENCE = privatePath;
  process.env.JWT_VERIFICATION_KEY_SET_REFERENCE = publicPath;

  const references = [
    ['REFRESH_TOKEN_HMAC', 'refresh'],
    ['OTP_HMAC', 'otp'],
    ['RECOVERY_CODE_HMAC', 'recovery'],
    ['IDENTIFIER_LOOKUP_HMAC', 'lookup'],
    ['M01_ENVELOPE_KEK', 'envelope'],
    ['CSRF_HMAC', 'csrf'],
  ] as const;
  for (const [prefix, fileName] of references) {
    const path = join(directory, `${fileName}.key`);
    writeFileSync(path, Buffer.alloc(32, fileName.length).toString('base64url'));
    process.env[
      `${prefix}_ACTIVE_KEY_VERSION`.replace(
        'M01_ENVELOPE_KEK_ACTIVE_KEY',
        'M01_ENVELOPE_KEK_ACTIVE',
      )
    ] = 'test-v1';
    process.env[
      `${prefix}_ACTIVE_KEY_REFERENCE`.replace(
        'M01_ENVELOPE_KEK_ACTIVE_KEY',
        'M01_ENVELOPE_KEK_ACTIVE',
      )
    ] = `file:${path}`;
  }
  process.env.REFRESH_TOKEN_HMAC_VERIFICATION_KEY_REFERENCES_JSON = '{}';
  process.env.OTP_HMAC_VERIFICATION_KEY_REFERENCES_JSON = '{}';
  process.env.RECOVERY_CODE_HMAC_VERIFICATION_KEY_REFERENCES_JSON = '{}';
  process.env.IDENTIFIER_LOOKUP_HMAC_VERIFICATION_KEY_REFERENCES_JSON = '{}';
  process.env.M01_ENVELOPE_KEK_DECRYPTION_REFERENCES_JSON = '{}';
  process.env.CSRF_HMAC_VERIFICATION_KEY_REFERENCES_JSON = '{}';
  process.env.EMAIL_VERIFICATION_PROVIDER = 'AWS_SES';
  process.env.SMS_VERIFICATION_PROVIDER = 'AWS_END_USER_MESSAGING_SMS';
}
