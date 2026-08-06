import type { HealthResponse } from '@walrus/types';

export function GET(): Response {
  const payload: HealthResponse = {
    status: 'UP',
    service: 'web',
    version: process.env.APP_VERSION ?? '1.0.0',
    timestamp: new Date().toISOString(),
  };
  return Response.json(payload);
}
