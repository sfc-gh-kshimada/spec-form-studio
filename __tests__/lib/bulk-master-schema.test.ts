import { describe, expect, it } from 'vitest';
import { bulkMasterDecision } from '../../lib/validation';

// The procedure left-joins the candidate and writes whichever provenance matched,
// so it trusts that each item took exactly one path. A row carrying both a
// candidate and a typed value would be written with the candidate's value while
// the reviewer believes they supplied their own, so the rejection has to happen
// here rather than being sorted out in SQL.
describe('bulk master decision schema', () => {
  const base = { product: 'sample_emulsifier', note: '確認済み', consent: true as const };
  const attribute = { attr_key: 'origin_detail', revision: 1, signature: 'a'.repeat(64) };
  const candidate = { ...attribute, candidate_id: 'b'.repeat(64), value: null };
  const typed = { ...attribute, candidate_id: null, value: '主としてリンゴ酸' };

  it('accepts a candidate item and a typed item', () => {
    expect(bulkMasterDecision.parse({ ...base, items: [candidate] }).items).toHaveLength(1);
    expect(bulkMasterDecision.parse({ ...base, items: [typed] }).items).toHaveLength(1);
  });

  it('accepts both kinds in one request', () => {
    expect(bulkMasterDecision.parse({ ...base, items: [candidate, typed] }).items).toHaveLength(2);
  });

  it('rejects an item claiming both a candidate and a typed value', () => {
    expect(() => bulkMasterDecision.parse({ ...base, items: [{ ...candidate, value: '手入力' }] })).toThrow();
  });

  it('rejects a typed item with no value', () => {
    expect(() => bulkMasterDecision.parse({ ...base, items: [{ ...typed, value: null }] })).toThrow();
    expect(() => bulkMasterDecision.parse({ ...base, items: [{ ...typed, value: '   ' }] })).toThrow();
  });

  // A null signature is legitimate: an attribute with no evidence yet. The
  // revision is not, because it is what the procedure checks the write against.
  it('keeps the revision and the null signature it had before', () => {
    expect(bulkMasterDecision.parse({ ...base, items: [{ ...typed, signature: null }] }).items).toHaveLength(1);
    expect(() => bulkMasterDecision.parse({ ...base, items: [{ ...typed, revision: undefined }] })).toThrow();
  });

  it('caps a request at the procedure\'s own limit', () => {
    const many = (count: number) => Array.from({ length: count }, (_, index) =>
      ({ ...typed, attr_key: `attr_${index}` }));
    expect(bulkMasterDecision.parse({ ...base, items: many(400) }).items).toHaveLength(400);
    expect(() => bulkMasterDecision.parse({ ...base, items: many(401) })).toThrow();
    expect(() => bulkMasterDecision.parse({ ...base, items: [] })).toThrow();
  });
});
