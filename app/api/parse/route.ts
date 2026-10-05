import { call, prefix, query, requireIdentity } from '@/lib/db';
import { parseRequest, readBody } from '@/lib/validation';
import { failure, json } from '@/lib/http';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Page = { page_index: number; content: string | null };

// Transcribes one uploaded document and returns every page. The procedure stores
// the result, so pressing the button again returns the stored text and reports
// cached=true instead of calling the AI a second time. The transcription is what
// the AI read, not a confirmed value: nothing here writes to a decision.
export async function POST(request: Request) {
  return timedRequest(async () => {
  try {
    await requireIdentity();
    const input = parseRequest.parse(await readBody(request));
    const result = await call('PARSE_UPLOAD', [input.path]);
    const pages = await query<Page>(
      `SELECT page_index,content FROM ${prefix}.DOC_PARSE WHERE stage_path=? ORDER BY page_index`,
      [input.path]);
    return json({ result, pages });
  } catch (error) { return failure(error); }
  });
}
