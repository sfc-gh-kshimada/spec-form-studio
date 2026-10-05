import { describe, expect, it } from 'vitest';
import { bulkFormDecision } from '../../lib/validation';

// The procedure trusts that each item takes exactly one path: it left-joins the
// master and writes whichever provenance columns matched. A row carrying both an
// attribute and a typed value would be written with both, claiming evidence nobody
// established, so the rejection has to happen here.
describe('bulk form decision schema', () => {
  const base = { product: 'sample_emulsifier', form: 'sample_genryo', note: '確認済み', consent: true as const };
  const field = { field_key: 'banned_in_process', revision: 1, template: 'a'.repeat(64) };
  const transcribe = { ...field, attr_key: 'origin_detail', master_revision: 1,
    value: null, source_path: null, source_version: null };
  const typed = { ...field, attr_key: null, master_revision: null,
    value: '主としてリンゴ酸', source_path: 'sample_emulsifier__spec.pdf', source_version: 'b'.repeat(64) };

  it('accepts a transcribed item and a typed item', () => {
    expect(bulkFormDecision.parse({ ...base, items: [transcribe] }).items).toHaveLength(1);
    expect(bulkFormDecision.parse({ ...base, items: [typed] }).items).toHaveLength(1);
  });

  it('rejects an item claiming both a master attribute and a typed value', () => {
    expect(() => bulkFormDecision.parse({ ...base, items: [{ ...transcribe, value: '手入力', source_path: 'sample_emulsifier__spec.pdf', source_version: 'b'.repeat(64) }] })).toThrow();
  });

  it('rejects a typed item with no value or no source document', () => {
    expect(() => bulkFormDecision.parse({ ...base, items: [{ ...typed, value: '   ' }] })).toThrow();
    expect(() => bulkFormDecision.parse({ ...base, items: [{ ...typed, source_path: null }] })).toThrow();
    expect(() => bulkFormDecision.parse({ ...base, items: [{ ...typed, source_version: null }] })).toThrow();
  });

  it('rejects a transcribed item with no master revision', () => {
    expect(() => bulkFormDecision.parse({ ...base, items: [{ ...transcribe, master_revision: null }] })).toThrow();
  });
});
