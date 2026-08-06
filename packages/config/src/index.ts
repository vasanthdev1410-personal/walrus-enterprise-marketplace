import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const environmentSchema = z.object({
  APP_NAME: z.string().min(1).default('WALRUS Enterprise Marketplace'),
  APP_ENV: z.enum(['local', 'development', 'test', 'staging', 'production']).default('local'),
  APP_VERSION: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .default('1.0.0'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  DATABASE_HOST: z.string().min(1).default('localhost'),
  DATABASE_PORT: z.coerce.number().int().min(1024).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1).default('walrus'),
  DATABASE_USER: z.string().min(1).default('walrus'),
  DATABASE_PASSWORD: z.string().min(12),
  DATABASE_SSL: booleanFromString.default(false),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1024).max(65535).default(6379),
  REDIS_PASSWORD: z.string().min(12),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.literal('json').default('json'),
  METRICS_ENABLED: booleanFromString.default(true),
  TRACE_ENABLED: booleanFromString.default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  SENTRY_DSN: z.union([z.literal(''), z.url()]).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
