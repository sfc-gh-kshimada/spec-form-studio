import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/document/route';
import { query } from '@/lib/db';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';

vi.mock('@/lib/db', () => ({ prefix: 'SPEC_FORM_STUDIO.QA_000000000000',
  stageFor: (kind: string) => (kind === 'upload' ? '@SPEC_FORM_STUDIO.QA_000000000000.UPLOADS' : '@SPEC_FORM_STUDIO.DOCS.RAW'),
  query: vi.fn() }));
vi.mock('node:fs/promises', () => ({ mkdtemp: vi.fn(), readFile: vi.fn(), stat: vi.fn(), rm: vi.fn() }));
const digest = 'a'.repeat(64);
const bytes = Buffer.from('%PDF-QA');
const request = () => new Request(`https://review.example/api/document?product=qa_product&path=qa_product__spec1.pdf&version=${digest}`);

describe('Registered PDF transfer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mkdtemp).mockResolvedValue('/tmp/qa-pdf');
    vi.mocked(stat).mockResolvedValue({ isFile: () => true, size: bytes.length } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(readFile).mockResolvedValue(bytes);
    vi.mocked(query).mockResolvedValueOnce([{ size_bytes: bytes.length }]).mockResolvedValueOnce([{ status: 'DOWNLOADED' }]).mockResolvedValueOnce([{}]);
  });
  it('returns a verified PDF without sharing its storage URL', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(rm).toHaveBeenCalledWith('/tmp/qa-pdf', { recursive: true, force: true });
  });
  it('supports registered customer subdirectories and Japanese filenames', async () => {
    const path = 'out/qa_product/原料調査票 (1).pdf';
    const response = await GET(new Request(`https://review.example/api/document?product=qa_product&path=${encodeURIComponent(path)}&version=${digest}`));
    expect(response.status).toBe(200);
    expect(readFile).toHaveBeenCalledWith('/tmp/qa-pdf/原料調査票 (1).pdf');
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('stage_path=?'), ['qa_product', path, digest]);
  });
  it('rejects traversal and SQL delimiters before transfer', async () => {
    for (const path of ['out/qa_product/../secret.pdf', 'out/qa_product/a\u0027.pdf', 'out/qa_product/a;select.pdf', 'out/qa_product/a%2f.pdf']) {
      expect((await GET(new Request(`https://review.example/api/document?product=qa_product&path=${encodeURIComponent(path)}&version=${digest}`))).status).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });
  it('does not transfer an unregistered or changed document', async () => {
    vi.mocked(query).mockReset().mockResolvedValue([]);
    expect((await GET(request())).status).toBe(409);
    expect(mkdtemp).not.toHaveBeenCalled();
  });
  it('rejects a failed transfer and cleans up', async () => {
    vi.mocked(query).mockReset().mockResolvedValueOnce([{ size_bytes: bytes.length }]).mockResolvedValueOnce([]);
    expect((await GET(request())).status).toBe(502);
    expect(readFile).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledTimes(1);
  });
  it('rejects size changes', async () => {
    vi.mocked(stat).mockResolvedValue({ isFile: () => true, size: 0 } as Awaited<ReturnType<typeof stat>>);
    expect((await GET(request())).status).toBe(409);
    expect(rm).toHaveBeenCalledTimes(1);
  });
  it('rejects non-PDF bytes', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('not PDF'));
    expect((await GET(request())).status).toBe(415);
    expect(rm).toHaveBeenCalledTimes(1);
  });
  it('rejects a version change during transfer', async () => {
    vi.mocked(query).mockReset().mockResolvedValueOnce([{ size_bytes: bytes.length }]).mockResolvedValueOnce([{ status: 'DOWNLOADED' }]).mockResolvedValueOnce([]);
    expect((await GET(request())).status).toBe(409);
    expect(rm).toHaveBeenCalledTimes(1);
  });
  it('enforces the registered size ceiling before transfer', async () => {
    vi.mocked(query).mockReset().mockResolvedValue([{ size_bytes: 51 * 1024 * 1024 }]);
    expect((await GET(request())).status).toBe(413);
    expect(mkdtemp).not.toHaveBeenCalled();
  });
  it('serves a document that was uploaded during a meeting from the upload stage', async () => {
    const path = 'uploads/sample_abc/1789589098964_375b3d79.pdf';
    const response = await GET(new Request(`https://review.example/api/document?product=sample_abc&path=${encodeURIComponent(path)}&version=${digest}`));
    expect(response.status).toBe(200);
    const transfer = vi.mocked(query).mock.calls[1][0];
    expect(transfer).toContain("GET '@SPEC_FORM_STUDIO.QA_000000000000.UPLOADS/uploads/sample_abc/");
    expect(transfer).not.toContain('DOCS.RAW');
  });
});