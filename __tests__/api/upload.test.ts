import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as upload } from '@/app/api/upload/route';
import { POST as structure } from '@/app/api/structure/route';
import { POST as parse } from '@/app/api/parse/route';
import { call, query } from '@/lib/db';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';

vi.mock('@/lib/db', () => ({
  prefix: 'SPEC_FORM_STUDIO.QA_000000000000',
  uploadStage: '@SPEC_FORM_STUDIO.QA_000000000000.UPLOADS',
  query: vi.fn(), call: vi.fn(), requireIdentity: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ mkdtemp: vi.fn(), writeFile: vi.fn(), stat: vi.fn(), rm: vi.fn() }));

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
const xls = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 0x20)]);
const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0x20)]);
const meta = (extra: Record<string, unknown> = {}) => JSON.stringify({
  product: 'sample_abc', productName: 'リハーサル素材', supplier: null, submitTo: null,
  docType: 'spec', newProduct: true, consent: true, ...extra,
});
function uploadRequest(body: FormData) {
  return new Request('http://127.0.0.1:8538/api/upload', {
    method: 'POST', body,
    headers: { origin: 'http://127.0.0.1:8538', host: '127.0.0.1:8538', 'x-sfs-request': '1' },
  });
}
function form(file: File | null, metaText = meta()) {
  const body = new FormData();
  if (file) body.append('file', file);
  body.append('meta', metaText);
  return body;
}
const file = (bytes = pdf, name = '新素材 規格書.pdf') => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

describe('Meeting upload intake', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/qa-upload');
    vi.mocked(stat).mockResolvedValue({ size: pdf.length } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(query).mockResolvedValue([{ status: 'UPLOADED' }]);
    vi.mocked(call).mockResolvedValue({ registered: true, product: 'sample_abc', doc_type: 'spec', decided_before: 0 });
  });

  it('stages one PDF under a generated ASCII path and registers it once', async () => {
    const response = await upload(uploadRequest(form(file())));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.path).toMatch(/^uploads\/sample_abc\/\d+_[0-9a-f]{8}\.pdf$/);
    expect(payload.original_filename).toBe('新素材 規格書.pdf');
    const put = vi.mocked(query).mock.calls[0][0];
    expect(put).toContain('AUTO_COMPRESS=FALSE');
    expect(put).toContain('OVERWRITE=FALSE');
    expect(vi.mocked(call)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(call).mock.calls[0][0]).toBe('REGISTER_UPLOAD');
    expect(rm).toHaveBeenCalledWith('/tmp/qa-upload', { recursive: true, force: true });
  });

  it('rejects a file whose bytes do not match its extension, before touching the stage', async () => {
    const response = await upload(uploadRequest(form(file(Buffer.from('PK\u0003\u0004 not a pdf'), 'a.pdf'))));
    expect(response.status).toBe(415);
    expect(query).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it('rejects an extension that is neither PDF nor Excel', async () => {
    const response = await upload(uploadRequest(form(file(pdf, 'notes.txt'))));
    expect(response.status).toBe(415);
    expect(query).not.toHaveBeenCalled();
  });

  it('converts a spreadsheet after registering it, keeping the original as the record', async () => {
    vi.mocked(stat).mockResolvedValue({ size: xls.length } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(call)
      .mockResolvedValueOnce({ registered: true, product: 'sample_abc', doc_type: 'spec', decided_before: 0, ext: 'xls' })
      .mockResolvedValueOnce({ rendered: true, render_path: 'uploads/sample_abc/1_2.xls.html', sheets: 1 });
    const response = await upload(uploadRequest(form(file(xls, '原料情報票.xls'))));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.extension).toBe('xls');
    expect(payload.path).toMatch(/^uploads\/sample_abc\/\d+_[0-9a-f]{8}\.xls$/);
    expect(payload.rendered.render_path).toBe('uploads/sample_abc/1_2.xls.html');
    expect(vi.mocked(call).mock.calls.map(entry => entry[0])).toEqual(['REGISTER_UPLOAD', 'RENDER_UPLOAD']);
  });

  it('accepts .xlsx and does not convert a PDF', async () => {
    vi.mocked(stat).mockResolvedValue({ size: xlsx.length } as Awaited<ReturnType<typeof stat>>);
    expect((await upload(uploadRequest(form(file(xlsx, 'a.xlsx'))))).status).toBe(200);
    expect(vi.mocked(call).mock.calls.map(entry => entry[0])).toContain('RENDER_UPLOAD');
    vi.mocked(call).mockClear();
    vi.mocked(stat).mockResolvedValue({ size: pdf.length } as Awaited<ReturnType<typeof stat>>);
    expect((await upload(uploadRequest(form(file())))).status).toBe(200);
    expect(vi.mocked(call).mock.calls.map(entry => entry[0])).toEqual(['REGISTER_UPLOAD']);
  });

  it('keeps a registered document when the conversion fails', async () => {
    vi.mocked(stat).mockResolvedValue({ size: xls.length } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(call)
      .mockResolvedValueOnce({ registered: true, product: 'sample_abc', doc_type: 'spec', decided_before: 0 })
      .mockRejectedValueOnce(new Error('エラー: Excelを変換できませんでした'));
    const response = await upload(uploadRequest(form(file(xls, 'a.xls'))));
    expect(response.status).toBe(500);
    // The staged file now belongs to the registry, so it must not be removed.
    expect(vi.mocked(query).mock.calls.every(entry => !String(entry[0]).startsWith('REMOVE'))).toBe(true);
  });

  it('requires a file, a valid product key and a product name for a new material', async () => {
    expect((await upload(uploadRequest(form(null)))).status).toBe(400);
    expect((await upload(uploadRequest(form(file(), meta({ product: 'Bad Key' }))))).status).toBe(400);
    expect((await upload(uploadRequest(form(file(), meta({ productName: null }))))).status).toBe(400);
    expect((await upload(uploadRequest(form(file(), meta({ docType: 'invoice' }))))).status).toBe(400);
    expect((await upload(uploadRequest(form(file(), meta({ consent: false }))))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('removes the staged file when registration is refused', async () => {
    vi.mocked(call).mockRejectedValue(new Error('エラー: 同じ内容の原本が既に登録されています'));
    const response = await upload(uploadRequest(form(file())));
    expect(response.status).toBe(500);
    const remove = vi.mocked(query).mock.calls.at(-1)?.[0] ?? '';
    expect(remove).toMatch(/^REMOVE '@SPEC_FORM_STUDIO\.QA_000000000000\.UPLOADS\/uploads\/sample_abc\//);
  });

  it('does not treat a skipped transfer as a successful upload', async () => {
    vi.mocked(query).mockResolvedValue([{ status: 'SKIPPED' }]);
    const response = await upload(uploadRequest(form(file())));
    expect(response.status).toBe(409);
    expect(call).not.toHaveBeenCalled();
  });

  it('refuses cross-site submissions and non-multipart bodies', async () => {
    const cross = new Request('http://127.0.0.1:8538/api/upload', {
      method: 'POST', body: form(file()),
      headers: { origin: 'http://evil.example', host: '127.0.0.1:8538', 'x-sfs-request': '1' },
    });
    expect((await upload(cross)).status).toBe(403);
    const json = new Request('http://127.0.0.1:8538/api/upload', {
      method: 'POST', body: '{}',
      headers: { origin: 'http://127.0.0.1:8538', host: '127.0.0.1:8538', 'x-sfs-request': '1', 'content-type': 'application/json' },
    });
    expect((await upload(json)).status).toBe(415);
  });
});

describe('Structuring one uploaded document', () => {
  const request = (body: unknown) => new Request('http://127.0.0.1:8538/api/structure', {
    method: 'POST', body: JSON.stringify(body),
    headers: { origin: 'http://127.0.0.1:8538', host: '127.0.0.1:8538', 'x-sfs-request': '1', 'content-type': 'application/json' },
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(call).mockResolvedValue({ structured: true, candidates: 5, doc_kind: 'spec' });
  });

  it('passes the consent flag through without retrying', async () => {
    const response = await structure(request({ path: 'uploads/sample_abc/1_2.pdf', consent: true }));
    expect(response.status).toBe(200);
    expect(vi.mocked(call).mock.calls).toEqual([['STRUCTURE_UPLOAD', ['uploads/sample_abc/1_2.pdf', true]]]);
  });

  it('rejects paths outside the upload area and traversal attempts', async () => {
    expect((await structure(request({ path: 'other_material__spec1.pdf', consent: false }))).status).toBe(400);
    expect((await structure(request({ path: 'uploads/../secret.pdf', consent: false }))).status).toBe(400);
    expect((await structure(request({ path: 'uploads/sample_abc/1_2.pdf' }))).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });

  it('accepts a spreadsheet path', async () => {
    expect((await structure(request({ path: 'uploads/sample_abc/1_2.xls', consent: false }))).status).toBe(200);
    expect((await structure(request({ path: 'uploads/sample_abc/1_2.xlsx', consent: false }))).status).toBe(200);
  });
});

describe('Transcribing one uploaded document', () => {
  const request = (body: unknown) => new Request('http://127.0.0.1:8538/api/parse', {
    method: 'POST', body: JSON.stringify(body),
    headers: { origin: 'http://127.0.0.1:8538', host: '127.0.0.1:8538', 'x-sfs-request': '1', 'content-type': 'application/json' },
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(call).mockResolvedValue({ parsed: true, cached: false, pages: 2, chars: 900 });
    vi.mocked(query).mockResolvedValue([{ page_index: 0, content: 'ページ1' }, { page_index: 1, content: 'ページ2' }]);
  });

  it('returns every stored page in reading order', async () => {
    const response = await parse(request({ path: 'uploads/sample_abc/1_2.pdf' }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.pages).toHaveLength(2);
    expect(vi.mocked(call).mock.calls).toEqual([['PARSE_UPLOAD', ['uploads/sample_abc/1_2.pdf']]]);
    expect(vi.mocked(query).mock.calls[0][0]).toContain('ORDER BY page_index');
  });

  it('does not accept a consent flag or a path outside the upload area', async () => {
    expect((await parse(request({ path: 'uploads/sample_abc/1_2.pdf', consent: true }))).status).toBe(400);
    expect((await parse(request({ path: 'other_material__spec1.pdf' }))).status).toBe(400);
    // The HTML rendition is resolved server-side and is not addressable from here.
    expect((await parse(request({ path: 'uploads/sample_abc/1_2.xls.html' }))).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });
});
