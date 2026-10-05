import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { call, query, requireIdentity, uploadStage } from '@/lib/db';
import { AppError, uploadMeta, verifyMutation } from '@/lib/validation';
import { failure, json } from '@/lib/http';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const limit = 20 * 1024 * 1024;
const quote = (value: string) => value.replaceAll("'", "''");

// The declared extension has to agree with the bytes, so a renamed file cannot
// reach an AI function that would reject it later. .xls is an OLE2 container and
// .xlsx is a zip, both of which start with a fixed signature.
const kinds: { extension: 'pdf' | 'xls' | 'xlsx'; label: string; signature: Buffer; scan: number }[] = [
  { extension: 'pdf', label: 'PDF', signature: Buffer.from('%PDF-'), scan: 1024 },
  { extension: 'xls', label: 'Excel (.xls)', signature: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), scan: 8 },
  { extension: 'xlsx', label: 'Excel (.xlsx)', signature: Buffer.from([0x50, 0x4b, 0x03, 0x04]), scan: 4 },
];
function classify(filename: string, bytes: Buffer) {
  const suffix = filename.toLowerCase().split('.').pop() ?? '';
  const kind = kinds.find(entry => entry.extension === suffix);
  if (!kind) throw new AppError(415, 'PDFまたはExcel（.xls / .xlsx）を選んでください。');
  if (!bytes.subarray(0, kind.scan).includes(kind.signature)) {
    throw new AppError(415, `${kind.label}形式ではありません。拡張子と中身が一致していません。`);
  }
  return kind.extension;
}

// Accepts one PDF or Excel file handed over during a meeting, stores it on the
// app schema's own upload stage, then registers exactly one document row. For a
// spreadsheet it also records an HTML rendition, because the AI functions do not
// read .xls or .xlsx. The original RAW stage and the existing documents are never
// modified. Nothing is extracted here: the caller must ask for structuring
// separately so the impact can be shown first.
export async function POST(request: Request) {
  return timedRequest(async () => {
  let directory: string | undefined;
  let staged: string | undefined;
  try {
    await requireIdentity();
    verifyMutation(request, 'multipart/form-data');
    if (Number(request.headers.get('content-length') ?? 0) > limit + 65536) {
      throw new AppError(413, 'ファイルが上限20MBを超えています。');
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError(400, 'ファイルを選んでください。');
    if (file.size === 0) throw new AppError(400, 'ファイルが空です。');
    if (file.size > limit) throw new AppError(413, 'ファイルが上限20MBを超えています。');
    const meta = uploadMeta.parse(JSON.parse(String(form.get('meta') ?? '{}')));
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size) throw new AppError(400, '受信サイズが一致しません。');
    const extension = classify(file.name, bytes);

    // The stored name is generated so the stage path stays ASCII and quoting-safe
    // whatever the customer's filename is; the real name goes to the registry.
    const stored = `${Date.now()}_${randomUUID().slice(0, 8)}.${extension}`;
    const stagePath = `uploads/${meta.product}/${stored}`;
    directory = await mkdtemp(join(tmpdir(), 'sfs-upload-'));
    const local = join(directory, stored);
    await writeFile(local, bytes, { mode: 0o600 });
    const written = await stat(local);
    if (written.size !== bytes.length) throw new AppError(500, '一時ファイルを保存できませんでした。');

    const target = `${uploadStage}/uploads/${meta.product}/`;
    // PUT must go through the synchronous driver path: the long-running path
    // polls a REST result set and never returns the stage information the file
    // transfer needs, which fails with an undefined locationType.
    const transfers = await query<{ status: string; target: string }>(
      `PUT 'file://${quote(local)}' '${quote(target)}' AUTO_COMPRESS=FALSE OVERWRITE=FALSE PARALLEL=1`);
    if (transfers.length !== 1 || !['UPLOADED', 'SKIPPED'].includes(String(transfers[0].status).toUpperCase())) {
      throw new AppError(502, '原本をステージに保存できませんでした。');
    }
    if (String(transfers[0].status).toUpperCase() === 'SKIPPED') {
      throw new AppError(409, '同じ名前の原本が既にあります。もう一度お試しください。');
    }
    staged = `${uploadStage}/${stagePath}`;
    const result = await call('REGISTER_UPLOAD', [meta.product, meta.productName, meta.supplier,
      stagePath, meta.docType, meta.submitTo, file.name.slice(0, 200), meta.newProduct,
      meta.uploadPurpose]);
    // Once the document is registered the staged file belongs to the registry, so
    // it is no longer a candidate for cleanup even if a later step fails.
    staged = undefined;
    // The rendition is a separate step so a conversion failure leaves the
    // registered original in place and reports itself rather than discarding a
    // file the customer just handed over.
    let rendered: unknown;
    if (extension !== 'pdf') rendered = await call('RENDER_UPLOAD', [stagePath]);
    return json({ result, rendered, extension, path: stagePath,
      original_filename: file.name.slice(0, 200), size_bytes: bytes.length });
  } catch (error) {
    // A staged file with no registry row is unreachable from the app, so it is
    // removed rather than left to accumulate. Registered documents are never
    // removed here.
    if (staged) {
      try { await query(`REMOVE '${quote(staged)}'`); }
      catch (cleanup) { console.error('[SFS upload cleanup failed]', cleanup instanceof Error ? cleanup.name : 'UnknownError'); }
    }
    return failure(error);
  }
  finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  });
}
