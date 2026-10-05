import { describe, expect, it } from 'vitest';
import { affectedQuery, blockingRefresh, referenceStaleTime } from '@/lib/query-refresh';
import { pollingDelay } from '@/lib/polling';

describe('targeted refresh', () => {
  it('invalidates candidates without making individual saves await their reread', () => {
    const input = { product: 'product_a' };
    const candidates = ['data', 'candidates', input];
    expect(affectedQuery(candidates, 'master', input)).toBe(true);
    expect(blockingRefresh(candidates, 'master', input)).toBe(false);
    expect(blockingRefresh(['data', 'history', input], 'master', input)).toBe(false);
    expect(blockingRefresh(['data', 'master', input], 'master', input)).toBe(true);
    expect(blockingRefresh(['data', 'fields', input], 'master', input)).toBe(true);
    expect(blockingRefresh(candidates, 'batch', { ...input, scope: 'master' })).toBe(true);
    expect(blockingRefresh(['data', 'master', { product: 'another' }], 'master', input)).toBe(false);
  });
  it('refreshes dependent forms but not immutable reads or another product', () => {
    const input = { product: 'product_a' };
    expect(affectedQuery(['data', 'fields', { product: 'product_a', form: 'one' }], 'master', input)).toBe(true);
    for (const resource of ['session', 'products', 'documents', 'references', 'forms', 'issues']) {
      expect(affectedQuery(['data', resource, { product: 'product_a' }], 'master', input)).toBe(false);
    }
    expect(affectedQuery(['data', 'master', { product: 'product_b' }], 'master', input)).toBe(false);
  });
  it('only refreshes the edited form and history', () => {
    expect(affectedQuery(['data', 'fields', { product: 'product_a', form: 'one' }], 'form', { product: 'product_a', form: 'two' })).toBe(false);
    expect(affectedQuery(['data', 'history', { product: 'product_a' }], 'form', { product: 'product_a' })).toBe(true);
    expect(affectedQuery(['data', 'master', { product: 'product_a' }], 'export', { product: 'product_a' })).toBe(false);
  });
  it('does not give decision reads a freshness interval', () => {
    expect(referenceStaleTime('master')).toBe(0);
    expect(referenceStaleTime('fields')).toBe(0);
    expect(referenceStaleTime('documents')).toBe(15000);
  });
  it('backs off within the completion observation bound', () => {
    expect([0, 1, 2, 3, 10].map(attempt => pollingDelay(200, 1000, attempt))).toEqual([200, 400, 800, 1000, 1000]);
    expect(pollingDelay(5000, 5000, 100)).toBe(5000);
    expect(() => pollingDelay(0, 1000, 0)).toThrow();
  });
});