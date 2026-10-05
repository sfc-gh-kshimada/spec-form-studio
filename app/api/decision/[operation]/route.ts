import { call, requireIdentity } from '@/lib/db';
import { AppError, batchDecision, bulkFormDecision, bulkMasterDecision, exportDecision, formDecision, layoutAdoptDecision, layoutReviewDecision, masterDecision, readBody } from '@/lib/validation';
import { failure, json } from '@/lib/http';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  return timedRequest(async () => {
  try {
    await requireIdentity();
    const { operation } = await context.params;
    const body = await readBody(request);
    let result: unknown;
    if (operation === 'master') {
      const input = masterDecision.parse(body);
      result = await call('DECIDE_MASTER', [input.product, input.attr, input.revision, input.signature, input.action, input.candidate, input.value, input.note]);
    } else if (operation === 'form') {
      const input = formDecision.parse(body);
      result = await call('DECIDE_FORM', [input.product, input.form, input.field, input.revision, input.template, input.attr, input.masterRevision, input.value, input.source, input.sourceVersion, input.note, input.action]);
    } else if (operation === 'batch') {
      const input = batchDecision.parse(body);
      result = await call('APPLY_TEST_BATCH', [input.product, input.scope, input.action, JSON.stringify(input.items)]);
    } else if (operation === 'bulk_master') {
      const input = bulkMasterDecision.parse(body);
      result = await call('CONFIRM_MASTER_BATCH', [input.product, JSON.stringify(input.items), input.note, input.consent]);
    } else if (operation === 'bulk_form') {
      const input = bulkFormDecision.parse(body);
      result = await call('CONFIRM_FORM_BATCH', [input.product, input.form, JSON.stringify(input.items), input.note, input.consent]);
    } else if (operation === 'layout_review') {
      const input = layoutReviewDecision.parse(body);
      result = await call('REVIEW_LAYOUT', [input.layout, input.version, input.form, input.hash, input.note, input.consent]);
    } else if (operation === 'layout_adopt') {
      const input = layoutAdoptDecision.parse(body);
      result = await call('ADOPT_LAYOUT', [input.layout, input.version, input.form, input.hash, input.applicability, input.note, input.consent]);
    } else if (operation === 'export') {
      const input = exportDecision.parse(body);
      result = input.layout
        ? await call('PREPARE_LAYOUT_EXPORT', [input.product, input.form, input.kind, input.layout.id, input.layout.version, input.layout.hash])
        : await call(input.kind === 'test_only' ? 'PREPARE_TEST_EXPORT' : 'PREPARE_EXPORT', [input.product, input.form]);
    } else { throw new AppError(404, '操作がありません。'); }
    return json({ result });
  } catch (error) { return failure(error); }
  });
}