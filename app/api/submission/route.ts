import { createHash } from 'node:crypto';
import { z } from 'zod';
import { call, prefix, query, requireIdentity } from '@/lib/db';
import { AppError, key, readBody, submissionRequest } from '@/lib/validation';
import { failure, json, privateHeaders } from '@/lib/http';
import { fontSha256, renderLayout, validateLayout } from '@/lib/form-layout';
import { renderLayoutDocx } from '@/lib/form-layout-docx';
import { timedRequest, tracePhase } from '@/lib/timing';
import type { ExportSnapshot } from '@/lib/model';

export const dynamic = 'force-dynamic';

// POST prepares a submission record. It is the only place that can create one,
// and it fails with the per-field blocker list rather than a single message so
// the screen can show what is actually missing.
export async function POST(request: Request) {
  return timedRequest(async () => {
    try {
      await requireIdentity();
      const input = submissionRequest.parse(await readBody(request));
      const result = await call('PREPARE_SUBMISSION_EXPORT',
        [input.product, input.form, input.layout.id, input.layout.version, input.layout.hash], true);
      if (result && typeof result === 'object' && 'error' in result) {
        return Response.json(result, { status: 409, headers: privateHeaders });
      }
      return json({ result });
    } catch (error) { return failure(error); }
  });
}

// GET renders the prepared record once and records the bytes it produced. A
// record that has already been rendered is refused: the plan requires that a
// double click or a retry cannot produce a second finished output, and serving
// the same record twice would leave two files whose provenance is one row.
export async function GET(request: Request) {
  return timedRequest(async () => {
    try {
      await requireIdentity();
      const params = new URL(request.url).searchParams;
      const id = z.uuid().parse(params.get('id'));
      const product = key.parse(params.get('product'));
      const form = key.parse(params.get('form'));
      // The format is chosen at render time rather than offered afterwards, because
      // one record records exactly one artifact: its sha256, byte count and
      // renderer describe the file that was produced. Wanting both a PDF and a
      // Word file means preparing two submission records, each with its own
      // provenance row, rather than one row standing for two different files.
      const format = z.enum(['pdf', 'docx']).default('pdf').parse(params.get('format') ?? undefined);
      const rows = await query<{
        rows_snapshot: ExportSnapshot['rows']; export_kind: string; render_state: string | null;
        approval_id: string | null; layout_snapshot: { id: string; version: string; hash: string; definition: unknown } | null;
      }>(`SELECT rows_snapshot,export_kind,render_state,approval_id,layout_snapshot FROM ${prefix}.EXPORT_HISTORY WHERE export_id=? AND product_slug=? AND form_id=? AND created_by=CURRENT_USER()`,
        [id, product, form]);
      if (rows.length !== 1) throw new AppError(404, '本人が作成した出力記録がありません。');
      const saved = rows[0];
      if (saved.export_kind !== 'submission' || !saved.layout_snapshot || !saved.approval_id) {
        throw new AppError(409, 'この記録は提出用ではありません。');
      }
      if (saved.render_state !== 'prepared') {
        throw new AppError(409, 'この出力記録は既に確定しています。提出前確認からもう一度作成してください。');
      }
      const layout = validateLayout(saved.layout_snapshot.definition, saved.layout_snapshot.hash, product, form);
      if (layout.id !== saved.layout_snapshot.id || layout.version !== saved.layout_snapshot.version) {
        throw new AppError(409, '保存済み帳票の識別子が一致しません。');
      }
      const snapshot: ExportSnapshot = { export_id: id, kind: 'submission', rows: saved.rows_snapshot, approval_id: saved.approval_id };
      const started = Date.now();
      let content: Uint8Array;
      try {
        content = format === 'docx'
          // A submission always has a layout, so the Word file is the form itself.
          ? renderLayoutDocx(layout, snapshot)
          : await renderLayout(layout, snapshot);
      } catch (error) {
        // Recorded as failed rather than left prepared, so an incomplete attempt
        // is never presented later as a finished output.
        await call('RECORD_SUBMISSION_RENDER', [id, 'failed', null, null, layout.renderer, fontSha256], true);
        throw error;
      }
      tracePhase('render', started);
      const digest = createHash('sha256').update(content).digest('hex');
      // The Word rendition embeds no font, so recording a font hash for it would
      // describe something the file does not contain.
      const recorded = await call('RECORD_SUBMISSION_RENDER',
        [id, 'rendered', digest, content.byteLength,
          format === 'docx' ? 'docx-ooxml-1' : layout.renderer, format === 'docx' ? null : fontSha256], true);
      if (recorded && typeof recorded === 'object' && 'error' in recorded) {
        throw new AppError(409, String(recorded.error));
      }
      return new Response(Buffer.from(content) as unknown as BodyInit, { headers: { ...privateHeaders,
        'Content-Type': format === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
        'Content-Disposition': `attachment; filename="SUBMISSION_${product}_${form}_${id}.${format}"`,
        'X-SFS-Output-Sha256': digest } });
    } catch (error) { return failure(error); }
  });
}
