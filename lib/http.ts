import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { AppError } from './validation';

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export function json(value: unknown) { return Response.json(value, { headers: privateHeaders }); }
export function failure(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status, headers: privateHeaders });
  if (error instanceof ZodError) return Response.json({ error: '入力項目・確認チェック・版を確認してください。' }, { status: 400, headers: privateHeaders });
  const incident = randomUUID();
  // The message goes to the server log, not to the caller: an upload failure
  // logged as just "Error" cost a diagnosis round trip through query history to
  // learn that a stage grant was missing. The user-facing text stays generic
  // because it may contain object names and SQL.
  console.error('[SFS request failed]', incident, error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError');
  return Response.json({ error: `処理を完了できませんでした。書込みの場合は再実行前に再読み込みして履歴を確認してください。受付ID: ${incident}` }, { status: 500, headers: privateHeaders });
}