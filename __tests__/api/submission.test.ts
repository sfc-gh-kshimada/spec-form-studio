import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GET, POST } from '@/app/api/submission/route';
import { layoutHash, layoutIssues, renderLayout } from '@/lib/form-layout';
import { layoutSchema } from '@/lib/layout-model';
import { query, call, requireIdentity } from '@/lib/db';
import type { ExportSnapshot } from '@/lib/model';

vi.mock('@/lib/db', () => ({ prefix: 'SPEC_FORM_STUDIO.QA_000000000000', query: vi.fn(), call: vi.fn(), requireIdentity: vi.fn() }));

const layout = layoutSchema.parse(JSON.parse(readFileSync('__tests__/fixtures/sample-layout.json', 'utf8')));
const id = '00000000-0000-4000-8000-000000000002';
const approval = 'a0000000-0000-4000-8000-000000000009';
const rows = (status: string) => layout.fields.map(field => ({
  field_key: field.key, label: field.label, value: '確認済みの値', status, template_signature: field.signature,
})) as ExportSnapshot['rows'];
const snapshot = (over: Partial<ExportSnapshot> = {}): ExportSnapshot =>
  ({ export_id: id, kind: 'submission', rows: rows('confirmed'), approval_id: approval, ...over });
const savedRow = (over: Record<string, unknown> = {}) => [{
  rows_snapshot: rows('confirmed'), export_kind: 'submission', render_state: 'prepared',
  approval_id: approval,
  layout_snapshot: { id: layout.id, version: layout.version, hash: layoutHashOf(), definition: layout },
  ...over,
}];
const layoutHashOf = () => layoutHash(layout);

describe('submission output', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireIdentity).mockResolvedValue(); });

  it('refuses to drop the draft marking without an adoption record', () => {
    expect(() => layoutIssues(layout, snapshot({ approval_id: null }))).toThrow('採用記録');
  });

  it('refuses a submission that carries a test value', () => {
    expect(() => layoutIssues(layout, snapshot({ rows: rows('test_confirmed') }))).toThrow('テスト値');
    expect(() => layoutIssues(layout, snapshot({ rows: rows('test_skipped') }))).toThrow('テスト値');
  });

  it('keeps the draft marking on every non-submission render', async () => {
    const draft = await PDFDocument.load(await renderLayout(layout, { ...snapshot(), kind: 'review_only' }));
    expect(draft.getTitle()).toContain('正式提出不可');
  });

  it('prints an adopted submission without the draft marking and with no annotations', async () => {
    const bytes = await renderLayout(layout, snapshot());
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).not.toContain('正式提出不可');
    expect(pdf.getTitle()).toContain(layout.version);
    expect(pdf.getAuthor()).toBe('');
    for (const page of pdf.getPages()) expect(page.node.Annots()?.size() ?? 0).toBe(0);
  });

  it('never prints into a seal or signature box', async () => {
    const sealed = layoutSchema.parse({ ...layout,
      fields: layout.fields.map(field => ({ ...field, label: '担当者印' })) });
    // A value far too long for the box is used as the proof: drawing it would be
    // refused as an overflow, so a render that succeeds is a render that put
    // nothing in the seal boxes. Byte length alone is a weak signal here because
    // the whole embedded font dominates the file size.
    const long = { rows: rows('confirmed').map(row => ({ ...row, value: '確認済みの値'.repeat(40) })) };
    await expect(renderLayout(sealed, snapshot(long))).resolves.toBeInstanceOf(Uint8Array);
    await expect(renderLayout(layout, snapshot(long))).rejects.toThrow('収まりません');
  });

  it('will not render a record that is not a prepared submission', async () => {
    const url = `https://review.example/api/submission?id=${id}&product=sample_emulsifier&form=sample_genryo`;
    vi.mocked(query).mockResolvedValue(savedRow({ export_kind: 'review_only' }));
    expect((await GET(new Request(url))).status).toBe(409);
    vi.mocked(query).mockResolvedValue(savedRow({ render_state: 'rendered' }));
    expect((await GET(new Request(url))).status).toBe(409);
    vi.mocked(query).mockResolvedValue(savedRow({ approval_id: null }));
    expect((await GET(new Request(url))).status).toBe(409);
    expect(call).not.toHaveBeenCalled();
  });

  it('reads only the requesting user\'s own record', async () => {
    vi.mocked(query).mockResolvedValue([]);
    const response = await GET(new Request(`https://review.example/api/submission?id=${id}&product=sample_emulsifier&form=sample_genryo`));
    expect(response.status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('created_by=CURRENT_USER()'),
      [id, 'sample_emulsifier', 'sample_genryo']);
  });

  it('returns the blocker list instead of preparing when conditions are unmet', async () => {
    vi.mocked(call).mockResolvedValue({ error: '提出用の条件を満たしていません。提出前確認を見てください。',
      blockers: [{ blocker: 'field_unconfirmed', field_key: 'unit_price', label: '参考単価', detail: '必須欄が未確認です。' }] });
    const response = await POST(new Request('https://review.example/api/submission', { method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://review.example', host: 'review.example', 'x-sfs-request': '1' },
      body: JSON.stringify({ product: 'sample_emulsifier', form: 'sample_genryo', consent: true,
        layout: { id: layout.id, version: layout.version, hash: layoutHashOf(), consent: true } }) }));
    expect(response.status).toBe(409);
    expect((await response.json()).blockers).toHaveLength(1);
  });

  it('does not accept a client-supplied output value or kind', async () => {
    const response = await POST(new Request('https://review.example/api/submission', { method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://review.example', host: 'review.example', 'x-sfs-request': '1' },
      body: JSON.stringify({ product: 'sample_emulsifier', form: 'sample_genryo', consent: true, kind: 'submission',
        rows: [{ field_key: 'unit_price', value: '1000' }],
        layout: { id: layout.id, version: layout.version, hash: layoutHashOf(), consent: true } }) }));
    expect(response.status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });
});
