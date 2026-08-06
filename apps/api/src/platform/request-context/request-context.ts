import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly correlationId: string;
  readonly requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
