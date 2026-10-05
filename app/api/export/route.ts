import { z } from 'zod';
import { prefix, query, requireIdentity } from '@/lib/db';
import { AppError, key } from '@/lib/validation';
import { failure, privateHeaders } from '@/lib/http';
import { layoutIssues, renderLayout, validateLayout } from '@/lib/form-layout';
import { exportCsv, exportHtml } from '@/lib/exports';
import { exportDocx } from '@/lib/exports-docx';
import { renderLayoutDocx } from '@/lib/form-layout-docx';
import { timedRequest, tracePhase } from '@/lib/timing';
import type { ExportSnapshot } from '@/lib/model';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return timedRequest(async () => {
    try {
      await requireIdentity();
      const params = new URL(request.url).searchParams;
      const id = z.uuid().parse(params.get('id'));
      const product = key.parse(params.get('product'));
      const form = key.parse(params.get('form'));
      const format = z.enum(['pdf', 'docx', 'html', 'csv', 'issues']).parse(params.get('format'));
      const rows = await query<{ rows_snapshot: ExportSnapshot['rows']; export_kind: ExportSnapshot['kind']; layout_snapshot: { id: string; version: string; hash: string; definition: unknown } | null }>(`SELECT rows_snapshot,export_kind,layout_snapshot FROM ${prefix}.EXPORT_HISTORY WHERE export_id=? AND product_slug=? AND form_id=? AND created_by=CURRENT_USER()`, [id, product, form]);
      if (rows.length !== 1) throw new AppError(404, '本人が作成した出力記録がありません。');
      const saved = rows[0];
      const snapshot: ExportSnapshot = { export_id: id, kind: saved.export_kind, rows: saved.rows_snapshot };
      const layout = saved.layout_snapshot ? validateLayout(saved.layout_snapshot.definition, saved.layout_snapshot.hash, product, form) : undefined;
      if (layout && (layout.id !== saved.layout_snapshot?.id || layout.version !== saved.layout_snapshot?.version)) throw new AppError(409, '保存済み帳票の識別子が一致しません。');
      if ((format === 'pdf' || format === 'issues') && !layout) throw new AppError(409, 'この記録には指定様式がありません。');
      if (format === 'issues') return Response.json({ issues: layoutIssues(layout!, snapshot) }, { headers: privateHeaders });
      const started = Date.now();
      const content = format === 'pdf' ? Buffer.from(await renderLayout(layout!, snapshot))
        // With a layout, Word reproduces the form itself; the field-list document is
        // only for the transcription sheet, where there is no form to reproduce.
        : format === 'docx' ? (layout ? renderLayoutDocx(layout, snapshot)
          : exportDocx(snapshot, product, form, undefined))
        : format === 'html' ? exportHtml(snapshot, product, layout?.name ?? form, `${prefix}.EXPORT_HISTORY`) : exportCsv(snapshot);
      tracePhase('render', started);
      const filename = `${snapshot.kind === 'test_only' ? 'TEST_ONLY' : 'DRAFT'}_${product}_${form}_${id}.${format}`;
      return new Response(content, { headers: { ...privateHeaders, 'Content-Type': format === 'pdf' ? 'application/pdf'
        : format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : format === 'html' ? 'text/html;charset=utf-8' : 'text/csv;charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } });
    } catch (error) { return failure(error); }
  });
}