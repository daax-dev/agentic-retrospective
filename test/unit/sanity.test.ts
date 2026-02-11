/**
 * Sanity test to verify vitest is working
 */

import { describe, test, expect } from 'vitest';

describe('Vitest Setup', () => {
  test('basic assertion works', () => {
    expect(1 + 1).toBe(2);
  });

  test('async test works', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });
});
