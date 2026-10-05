import { call, requireIdentity } from '@/lib/db';
import { readBody, structureRequest } from '@/lib/validation';
import { failure, json } from '@/lib/http';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Runs classification and attribute extraction for exactly one uploaded document.
// The procedure refuses to run twice for the same file and refuses to run at all
// when confirmed rows would be reopened without consent, so no retry logic or
// optimistic success is added here.
//
// mode 'restructure' calls RESTRUCTURE_UPLOAD instead, which discards the
// document's previous extraction inside the same transaction as the new one, so
// a refusal or a failed AI call leaves what was already there.
export async function POST(request: Request) {
  return timedRequest(async () => {
  try {
    await requireIdentity();
    const input = structureRequest.parse(await readBody(request));
    const procedure = input.mode === 'restructure' ? 'RESTRUCTURE_UPLOAD' : 'STRUCTURE_UPLOAD';
    const result = await call(procedure, [input.path, input.consent]);
    return json({ result });
  } catch (error) { return failure(error); }
  });
}
