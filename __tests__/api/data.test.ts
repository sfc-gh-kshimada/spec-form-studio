import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/data/route';
import { POST } from '@/app/api/decision/[operation]/route';
import { call, query } from '@/lib/db';
vi.mock('@/lib/db', () => ({ prefix: 'SPEC_FORM_STUDIO.QA_000000000000', query: vi.fn(), call: vi.fn(), requireIdentity: vi.fn() }));
const digest = 'a'.repeat(64);
const body = { product: 'other_material', attr: 'maker_name', revision: 0, signature: digest, action: 'approve', candidate: digest, value: null, note: 'QA', consent: true };
const request = (value: unknown, origin = 'https://review.example') => new Request('https://review.example/api/decision/master', { method: 'POST', headers: { host: 'review.example', origin, 'content-type': 'application/json', 'x-sfs-request': '1' }, body: JSON.stringify(value) });
describe('API boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(query).mockResolvedValue([]); vi.mocked(call).mockResolvedValue('保存しました。'); });
  it('binds product and attribute with no shared cache', async () => {
    const response = await GET(new Request('https://review.example/api/data?resource=candidates&product=other_material&attr=maker_name'));
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('product_slug=?'), ['other_material', 'maker_name']);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects unknown resources before SQL', async () => {
    expect((await GET(new Request('https://review.example/api/data?resource=sql'))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('requires consent', async () => {
    expect((await POST(request({ ...body, consent: false }), { params: Promise.resolve({ operation: 'master' }) })).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects requests from another origin', async () => {
    expect((await POST(request(body, 'https://other.example'), { params: Promise.resolve({ operation: 'master' }) })).status).toBe(403);
    expect(call).not.toHaveBeenCalled();
  });
  it('passes exact validated arguments once', async () => {
    expect((await POST(request(body), { params: Promise.resolve({ operation: 'master' }) })).status).toBe(200);
    expect(call).toHaveBeenCalledExactlyOnceWith('DECIDE_MASTER', ['other_material', 'maker_name', 0, digest, 'approve', digest, null, 'QA']);
  });
  it('does not retry a write on failure', async () => {
    vi.mocked(call).mockRejectedValue(new Error('Connection lost'));
    expect((await POST(request(body), { params: Promise.resolve({ operation: 'master' }) })).status).toBe(500);
    expect(call).toHaveBeenCalledTimes(1);
  });
});