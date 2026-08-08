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
    const adapter = new NonProductionCsrfAdapter({ version: 'new', key: Buffer.alloc(32, 3) }, [
      { version: 'old', key: Buffer.alloc(32, 2) },
    ]);
    expect(adapter.verify({ cookieToken: old, headerToken: old })).toBe(true);
    expect(adapter.issue()).toContain('v1.new.');
  });

  it('rejects duplicate key versions in the verification list', () => {
    expect(
      () =>
        new NonProductionCsrfAdapter({ version: 'v', key: Buffer.alloc(32, 1) }, [
          { version: 'dup', key: Buffer.alloc(32, 2) },
          { version: 'dup', key: Buffer.alloc(32, 3) },
        ]),
    ).toThrow('CSRF key versions must be unique');
  });

  it('rejects malformed active keys (bad version pattern or key length)', () => {
    expect(
      () => new NonProductionCsrfAdapter({ version: 'bad version!', key: Buffer.alloc(32, 1) }, []),
    ).toThrow('Invalid CSRF key');
    expect(
      () => new NonProductionCsrfAdapter({ version: 'ok', key: Buffer.alloc(16, 1) }, []),
    ).toThrow('Invalid CSRF key');
  });

  it('verification fails on mismatched tokens, wrong format, and unknown version', () => {
    const adapter = new NonProductionCsrfAdapter({ version: 'v1', key: Buffer.alloc(32, 1) }, []);
    const token = adapter.issue();
    expect(adapter.verify({ cookieToken: token, headerToken: 'different' })).toBe(false);
    expect(adapter.verify({ cookieToken: 'not-a-token', headerToken: 'not-a-token' })).toBe(false);
    expect(
      adapter.verify({ cookieToken: 'v1.unknown.abc.def', headerToken: 'v1.unknown.abc.def' }),
    ).toBe(false);
    expect(adapter.verify({ cookieToken: 'v9.a.b.c', headerToken: 'v9.a.b.c' })).toBe(false);
    expect(adapter.verify({ cookieToken: 'v1..', headerToken: 'v1..' })).toBe(false);
  });

  it('rejects non-canonical or padded keys and non-file references', async () => {
    const config = {
      csrf: {
        activeKeyVersion: 'v1',
        activeKeyReference: 'not-a-file-reference',
        verificationKeyReferences: {},
      },
    } as never;
    await expect(
      NonProductionCsrfAdapter.fromFileReferences(config, 'development'),
    ).rejects.toThrow('Only file: CSRF references are permitted');

    await expect(
      NonProductionCsrfAdapter.fromFileReferences(
        {
          csrf: {
            activeKeyVersion: 'v1',
            activeKeyReference: 'file:relative/path',
            verificationKeyReferences: {},
          },
        } as never,
        'development',
      ),
    ).rejects.toThrow('CSRF key reference must be absolute');
  });

  it('prohibits construction for the production environment', async () => {
    await expect(
      NonProductionCsrfAdapter.fromFileReferences({} as never, 'production'),
    ).rejects.toThrow('Non-production CSRF adapter prohibited');
  });
});
