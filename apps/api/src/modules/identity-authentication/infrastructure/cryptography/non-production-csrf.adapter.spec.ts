import { NonProductionCsrfAdapter } from './non-production-csrf.adapter';

describe('NonProductionCsrfAdapter', () => {
  it('signs double-submit tokens and rejects tampering', () => {
    const adapter = new NonProductionCsrfAdapter(
      { version: 'test-v1', key: Buffer.alloc(32, 1) },
      [],
    );
    const token = adapter.issue();
    expect(adapter.verify({ cookieToken: token, headerToken: token })).toBe(true);
    expect(adapter.verify({ cookieToken: token, headerToken: `${token}x` })).toBe(false);
  });

  it('accepts an overlapping verification key but issues only with the active key', () => {
    const old = new NonProductionCsrfAdapter(
      { version: 'old', key: Buffer.alloc(32, 2) },
      [],
    ).issue();
    const adapter = new NonProductionCsrfAdapter(
      { version: 'new', key: Buffer.alloc(32, 3) },
      [{ version: 'old', key: Buffer.alloc(32, 2) }],
    );
    expect(adapter.verify({ cookieToken: old, headerToken: old })).toBe(true);
    expect(adapter.issue()).toContain('v1.new.');
  });
});
