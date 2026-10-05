import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/export/route';
import { GET as preview } from '@/app/api/layout/route';
import { POST } from '@/app/api/decision/[operation]/route';
import { query, call, requireIdentity } from '@/lib/db';
import { layoutHash } from '@/lib/form-layout';
import { layoutSchema } from '@/lib/layout-model';

vi.mock('@/lib/db', () => ({ prefix: 'SPEC_FORM_STUDIO.QA_000000000000', query: vi.fn(), call: vi.fn(), requireIdentity: vi.fn() }));
const layout = layoutSchema.parse(JSON.parse(readFileSync('__tests__/fixtures/sample-layout.json', 'utf8')));
const id = '00000000-0000-4000-8000-000000000001';
const url = `https://review.example/api/export?id=${id}&product=sample_emulsifier&form=sample_genryo&format=pdf`;
describe('layout API access and snapshot boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(query).mockResolvedValue([]); vi.mocked(requireIdentity).mockResolvedValue(); });
  it('authorizes saved exports as the current user without preparing again', async () => {
    expect((await GET(new Request(url))).status).toBe(404);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('created_by=CURRENT_USER()'), [id, 'sample_emulsifier', 'sample_genryo']);
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects malformed IDs without SQL', async () => {
    expect((await GET(new Request(url.replace(id, '../secret')))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('does not accept client-provided output values', async () => {
    const request = new Request('https://review.example/api/decision/export', { method: 'POST', headers: { host: 'review.example', origin: 'https://review.example', 'content-type': 'application/json', 'x-sfs-request': '1' }, body: JSON.stringify({ product: 'sample_emulsifier', form: 'sample_genryo', kind: 'review_only', consent: true, rows: [{ value: 'fake' }] }) });
    expect((await POST(request, { params: Promise.resolve({ operation: 'export' }) })).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });
  it('allows empty pending template preview only through authenticated route', async () => {
    vi.mocked(query).mockResolvedValue([{ definition: layout, mapping_hash: layoutHash(layout) }]);
    const response = await preview(new Request(`https://review.example/api/layout?product=sample_emulsifier&form=sample_genryo&id=${layout.id}&version=${layout.version}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(requireIdentity).toHaveBeenCalled();
  });
});