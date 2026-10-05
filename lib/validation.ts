import { z } from 'zod';

export const key = z.string().regex(/^[a-z0-9_]+$/).max(100);
export const signature = z.string().regex(/^[a-fA-F0-9]{64}$/);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const note = z.string().trim().min(1).max(4000);
const value = z.string().trim().min(1).max(16000).nullable();
export const documentPath = z.string().max(500).refine(path =>
  /^[a-z0-9_]+__[a-z0-9_]+\.(pdf|xls|xlsx|doc|docx)$/.test(path) ||
  ((/^out\/[a-z0-9_]+\/[^/]+\.(pdf|xls|xlsx|doc|docx)$/.test(path) || /^uploads\/[a-z0-9_]+\/[a-z0-9_.-]+\.(pdf|xls|xlsx)$/.test(path))
    && !/[\u0000-\u001f\u007f'"\\%;]/.test(path) && !path.includes('..')));
// Received-during-meeting documents. The stored path is app-generated and ASCII
// only; the customer's original filename is kept separately for display. The
// HTML rendition of a spreadsheet is never addressable from the client: only the
// original is, and the procedures resolve the rendition server-side.
export const uploadPath = z.string().max(500).refine(path =>
  /^uploads\/[a-z0-9_]+\/[a-z0-9_.-]+\.(pdf|xls|xlsx)$/.test(path) && !path.includes('..'));
export const docKind = z.enum(['spec', 'sds', 'coa', 'catalog', 'form']);
export const uploadKind = z.enum(['pdf', 'xls', 'xlsx']);
export const uploadMeta = z.object({
  product: key, productName: z.string().trim().max(200).nullable(),
  supplier: z.string().trim().max(200).nullable(), submitTo: z.string().trim().max(200).nullable(),
  docType: docKind, newProduct: z.boolean(), consent: z.literal(true),
  // Tab 03 registers documents for structuring tests. They are stored in the
  // production schema but excluded from the master and form reviews, so the
  // distinction has to reach the procedure rather than being inferred. A test
  // upload may still create a product: the product row is production either way.
  uploadPurpose: z.enum(['production', 'test']).default('production'),
}).strict().refine(body => !body.newProduct || !!body.productName, '新しい商品の名称を入力してください。');
export const structureRequest = z.object({
  path: uploadPath, consent: z.boolean(),
  // 'restructure' discards the document's previous extraction and runs it again.
  mode: z.enum(['structure', 'restructure']).default('structure'),
}).strict();
export const parseRequest = z.object({ path: uploadPath }).strict();
const base = { product: key, consent: z.literal(true) };
export const masterDecision = z.object({ ...base, attr: key, revision, signature,
  action: z.enum(['approve', 'manual', 'reject', 'reopen']), candidate: signature.nullable(), value, note }).strict()
  .refine(body => body.action !== 'approve' || !!body.candidate, '候補を指定してください。')
  .refine(body => body.action !== 'manual' || !!body.value, '確認値を記入してください。');
export const formDecision = z.object({ ...base, form: key, field: key, revision, template: signature,
  attr: key.nullable(), masterRevision: revision.nullable(), value,
  source: documentPath.nullable(), sourceVersion: signature.nullable(), note,
  action: z.enum(['confirm', 'reopen']) }).strict().refine(body => body.action === 'reopen' ||
    (body.attr ? body.masterRevision !== null : !!(body.value && body.source && body.sourceVersion)), '転記元を確認してください。');
export const batchDecision = z.object({ ...base, scope: key, action: z.enum(['apply', 'apply_with_skips', 'reset']),
  items: z.array(z.object({ scope_id: key, field_key: key, revision, signature, candidate_id: signature.nullable() }).strict()).min(1).max(500)
}).strict().refine(body => body.scope !== 'all' || body.action === 'reset');
// Confirming many master values at once. Each item takes exactly one path, the
// same two a one-by-one confirm offers: approve an extracted candidate, or carry a
// value the reviewer typed. The refine is what keeps a row from claiming both, so
// the procedure never has to guess which one won. A bulk confirm records the same
// evidence a one-by-one confirm would; the procedure re-checks every revision,
// signature and candidate and applies nothing if one of them moved. The 400 cap
// matches the procedure's own limit rather than relying on it alone.
//
// Unlike the form side, a typed value needs no document: DECIDE_MASTER's 'manual'
// action does not ask for one either, because the reviewer is stating the value
// rather than pointing at where it was read.
const bulkMasterItem = z.object({ attr_key: key, revision, signature: signature.nullable(),
  candidate_id: signature.nullable(), value
}).strict().refine(item => item.candidate_id !== null
  ? item.value === null
  : !!item.value?.trim());
export const bulkMasterDecision = z.object({ ...base, note,
  items: z.array(bulkMasterItem).min(1).max(400)
}).strict();
// Confirming many form fields at once. Each item takes exactly one path, the same
// two a one-by-one confirm offers: transcribe a confirmed master attribute (named
// with the revision it was confirmed at), or carry a value the reviewer typed after
// reading an original (named with that document and its version). The refine is
// what keeps a row from claiming both provenances; the procedure re-checks both.
const bulkFormItem = z.object({ field_key: key, revision, template: signature.nullable(),
  attr_key: key.nullable(), master_revision: revision.nullable(),
  value, source_path: documentPath.nullable(), source_version: signature.nullable()
}).strict().refine(item => item.attr_key !== null
  ? item.master_revision !== null && item.value === null && item.source_path === null && item.source_version === null
  : item.master_revision === null && !!item.value?.trim() && item.source_path !== null && item.source_version !== null);
export const bulkFormDecision = z.object({ ...base, form: key, note,
  items: z.array(bulkFormItem).min(1).max(400)
}).strict();
// Recording the visual check of a reconstructed layout. There is no product here:
// the statement is about one version of one form, not about a material. The hash
// pins it to the definition the reviewer actually looked at.
export const layoutReviewDecision = z.object({
  layout: key, version: z.string().regex(/^[a-z0-9_.-]+$/).max(100), form: key,
  hash: signature, note, consent: z.literal(true)
}).strict();
// Adopting one layout version for real submissions. Separate from the visual check
// because it is a different claim: that this reconstruction may stand as the
// customer's form. The applicability is stored on the approval row, so it is asked
// for here rather than derived.
export const layoutAdoptDecision = z.object({
  layout: key, version: z.string().regex(/^[a-z0-9_.-]+$/).max(100), form: key,
  hash: signature, applicability: note, note, consent: z.literal(true)
}).strict();
export const exportDecision = z.object({ ...base, form: key, kind: z.enum(['review_only', 'test_only']),
  layout: z.object({ id: key, version: z.string().regex(/^[a-z0-9_.-]+$/).max(100), hash: signature, consent: z.literal(true) }).strict().optional() }).strict();
// A submission always names one adopted layout version, so the layout block is
// required here rather than optional. There is no 'kind': this route only ever
// prepares a submission, which keeps the draft and test paths unreachable from it.
export const submissionRequest = z.object({ ...base, form: key,
  layout: z.object({ id: key, version: z.string().regex(/^[a-z0-9_.-]+$/).max(100), hash: signature, consent: z.literal(true) }).strict() }).strict();
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function verifyMutation(request: Request, contentType = 'application/json') {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || request.headers.get('x-sfs-request') !== '1' ||
      request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, '同じ画面から操作してください。');
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new AppError(403, '操作元を確認できません。'); }
  const local = /^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(host);
  if (parsed.host !== host || (!local && parsed.protocol !== 'https:') || !['https:', 'http:'].includes(parsed.protocol)) {
    throw new AppError(403, '操作元が一致しません。');
  }
  if (!request.headers.get('content-type')?.startsWith(contentType)) {
    throw new AppError(415, contentType === 'application/json' ? 'JSONが必要です。' : 'ファイル送信の形式が違います。');
  }
}
export async function readBody(request: Request): Promise<unknown> {
  verifyMutation(request);
  if (Number(request.headers.get('content-length') ?? 0) > 256000) throw new AppError(413, '対象が多すぎます。');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, '内容がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 256000) { await reader.cancel(); throw new AppError(413, '対象が多すぎます。'); }
    chunks.push(next.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, '入力内容を確認してください。'); }
}