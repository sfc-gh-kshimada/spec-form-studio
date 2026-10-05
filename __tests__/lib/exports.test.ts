import { describe, expect, it } from 'vitest';
import { exportCsv, exportHtml, safeCell } from '@/lib/exports';
import { displayValue, skipLabel, type ExportSnapshot, type State } from '@/lib/model';

const states: State[] = ['confirmed', 'test_confirmed', 'test_skipped', 'changed', 'review', 'missing', 'pending', 'rejected'];
const snapshot: ExportSnapshot = { kind: 'test_only', export_id: 'qa-export', rows: states.map((status, index) => ({
  field_key: `field_${index}`, section: 'QA', label: `Label ${index}`, status,
  value: status === 'test_skipped' ? null : `QA_VALUE_${index}`, source_note: 'QA reference', decided_by: 'QA_USER'
})) };

describe('Review output safety', () => {
  it('keeps all unconfirmed values out of normal output', () => {
    for (const row of snapshot.rows) expect(displayValue(row)).toBe(row.status === 'confirmed' ? row.value : '');
    const csv = exportCsv({ ...snapshot, kind: 'review_only' });
    expect(csv).toContain('QA_VALUE_0');
    for (const row of snapshot.rows.slice(1)) if (row.value) expect(csv).not.toContain(row.value);
    expect(csv).not.toContain(skipLabel);
  });
  it('renders skips only as display text without changing the snapshot', () => {
    const before = JSON.stringify(snapshot);
    expect(exportCsv(snapshot)).toContain(skipLabel);
    expect(exportHtml(snapshot, 'QA', 'QA')).toContain('テスト確定・内容未確認');
    expect(exportHtml(snapshot, 'QA', 'QA')).toContain('テスト入力省略・値未提供');
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(snapshot.rows[2].value).toBeNull();
  });
  it.each(['=1', '+1', '-1', '@value', '  =1', '\tvalue', '\rvalue', '\nvalue'])('quotes spreadsheet control text %j', value => {
    expect(safeCell(value)).toBe(`'${value}`);
  });
  it('escapes markup in text and embedded metadata', () => {
    const html = exportHtml({ ...snapshot, rows: [{ ...snapshot.rows[0], value: '<unsafe>&"\'' }] }, '<product>', '</script><unsafe>');
    expect(html).toContain('&lt;unsafe&gt;&amp;&quot;&#39;');
    expect(html).not.toContain('<unsafe>');
    expect(html).not.toContain('<product>');
  });
});