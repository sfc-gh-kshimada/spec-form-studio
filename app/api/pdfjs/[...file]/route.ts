import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { failure, privateHeaders } from '@/lib/http';
import { AppError } from '@/lib/validation';

// pdf.js assets served through a route instead of /public. In the deployed app a
// fetch for /pdfjs/pdf.worker.min.mjs fails with "Failed to fetch dynamically
// imported module" — the same fetch for a .js name fails identically, so it is
// not a content-type problem: the static path is simply not reachable from the
// worker's fetch. The app's own routes are reachable, so the files are read off
// disk and returned here with an explicit type.
//
// No identity check: these are the pdf.js library files, not customer data, and a
// module-worker fetch cannot be relied on to carry the session.
export const dynamic = 'force-dynamic';

const types: Record<string, string> = {
  mjs: 'text/javascript; charset=utf-8', js: 'text/javascript; charset=utf-8',
  bcmap: 'application/octet-stream', pfb: 'application/octet-stream',
  wasm: 'application/wasm', map: 'application/json',
};

export async function GET(_request: Request, context: { params: Promise<{ file: string[] }> }) {
  try {
    const { file } = await context.params;
    const relative = file.join('/');
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('..')) {
      throw new AppError(400, 'ファイル名を確認してください。');
    }
    const extension = relative.split('.').pop() ?? '';
    const bytes = await readFile(join(process.cwd(), 'public', 'pdfjs', relative))
      .catch(() => { throw new AppError(404, '表示部品がありません。'); });
    return new Response(Buffer.from(bytes) as unknown as BodyInit, {
      headers: { ...privateHeaders, 'Content-Type': types[extension] ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600' },
    });
  } catch (error) { return failure(error); }
}
