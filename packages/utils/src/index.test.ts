import { describe, expect, it } from 'vitest';
import { isNonEmptyString } from './index.js';

describe('isNonEmptyString', () => {
  it('accepts meaningful strings', () => {
    expect(isNonEmptyString('walrus')).toBe(true);
  });
  it('rejects whitespace', () => {
    expect(isNonEmptyString('   ')).toBe(false);
  });
});
