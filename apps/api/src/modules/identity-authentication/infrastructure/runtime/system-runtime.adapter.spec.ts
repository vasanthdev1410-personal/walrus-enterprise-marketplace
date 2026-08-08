import { SystemClockAdapter, SystemUuidV7Generator } from './system-runtime.adapter';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('System runtime adapters', () => {
  it('reports the current wall-clock time', () => {
    const clock = new SystemClockAdapter();
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('generates unique UUID version 7 values', () => {
    const generator = new SystemUuidV7Generator();

    const first = generator.next();
    const second = generator.next();

    expect(first.value).toMatch(UUID_V7_PATTERN);
    expect(second.value).toMatch(UUID_V7_PATTERN);
    expect(second.value).not.toBe(first.value);
  });
});
