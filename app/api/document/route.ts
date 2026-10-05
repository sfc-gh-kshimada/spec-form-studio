import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { prefix, query, stageFor } from '@/lib/db';
import { AppError, documentPath, key, signature } from '@/lib/validation';
import { failure, privateHeaders } from '@/lib/http';
import type { Document } from '@/lib/model';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  return timedRequest(async () => {
  let directory: string | undefined;
  try {
    const search = new URL(request.url).searchParams;
    const product = key.parse(search.get('product'));
    const path = documentPath.parse(search.get('path'));
    const version = signature.parse(search.get('version'));
    // DOCUMENT_ALL_V rather than DOCUMENT_V: this is a single-document fetch
    // pinned to an exact stage path and version, and tab 03 has to open the test
    // uploads that the production-only view excludes. The product, path and
    // version all still have to match, so nothing extra becomes reachable.
    const lookup = `SELECT * FROM ${prefix}.DOCUMENT_ALL_V WHERE product_slug=? AND stage_path=? AND version_key=? AND is_current`;
    const documents = await query<Document>(lookup, [product, path, version]);
    if (documents.length !== 1) throw new AppError(409, '原本の登録または版が変わりました。再読み込みしてください。');
    const document = documents[0];
    if (document.size_bytes > 50 * 1024 * 1024) throw new AppError(413, '原本が表示上限50MBを超えています。');
    directory = await mkdtemp(join(tmpdir(), 'sfs-'));
    const pattern = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\', '\\\\');
    const source = stageFor(path.startsWith('uploads/') ? 'upload' : 'raw');
    const transfers = await query(`GET '${source}/${path}' 'file://${directory.replaceAll("'", "''")}' PATTERN='.*${pattern}$' PARALLEL=1`);
    if (transfers.length !== 1 || transfers[0].status !== 'DOWNLOADED') throw new AppError(502, '原本を取得できませんでした。');
    const file = join(directory, basename(path));
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size !== Number(document.size_bytes)) throw new AppError(409, '原本のサイズが変わりました。');
    const bytes = await readFile(file);
    // Only a PDF is served inline for the viewer. A spreadsheet is returned as a
    // download because the browser cannot render it; its content is reviewed
    // through the stored transcription instead.
    const types: Record<string, string> = {
      pdf: 'application/pdf', xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const extension = path.toLowerCase().split('.').pop() ?? '';
    const media = types[extension];
    if (!media) throw new AppError(415, '対応していないファイル形式です。');
    if (extension === 'pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new AppError(415, 'PDF形式ではありません。');
    }
    if ((await query(lookup, [product, path, version])).length !== 1) throw new AppError(409, '取得中に原本が変わりました。');
    return new Response(bytes, { headers: { ...privateHeaders, 'Content-Type': media,
      'Content-Disposition': `${extension === 'pdf' ? 'inline' : 'attachment'}; filename="source.${extension}"; filename*=UTF-8''${encodeURIComponent(basename(path))}` } });
  } catch (error) { return failure(error); }
  finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  });
}