import { describe, expect, it } from 'vitest';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './index.js';

describe('platform headers', () => {
  it('uses the approved tracing header names', () => {
    expect(CORRELATION_ID_HEADER).toBe('x-correlation-id');
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
  });
});
