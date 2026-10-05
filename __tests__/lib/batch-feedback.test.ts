import { describe, expect, it } from 'vitest';
import { batchExclusions, batchRemainingMessage, batchResultMessage, formBatchReview, masterBatchReview, needsBatchReview } from '@/lib/batch-feedback';
import type { BatchItem, Document, Field, Master } from '@/lib/model';

const master: Master = {
  attr_key: 'maker_name', attr_label: 'メーカー名', section: '供給者', display_order: 1,
  value: null, status: 'review', decision_state: 'pending', revision: 0,
  current_signature: 'a'.repeat(64), n_candidates: 3, n_values: 2, n_documents: 3,
  source_note: null, source_path: null, candidate_id: null,
};
const field: Field = {
  field_key: 'maker', field_label: 'メーカー', section: '基本', value: null,
  output_value: null, status: 'pending', revision: 0, selected_attr: null,
  suggested_attr: 'maker_name', required: true, guidance: null,
  current_template_signature: 'b'.repeat(64),
};
const document: Document = {
  stage_path: 'product_a__sds1.pdf', product_slug: 'product_a', original_filename: 'SDS.pdf',
  doc_role: 'input', doc_type: 'sds', is_current: false, version_key: 'version',
  size_bytes: 100, customer_key: null,
};
const target: BatchItem = {
  scope_id: 'master', field_key: 'maker_name', label: 'メーカー名', revision: 0,
  signature: 'a'.repeat(64), candidate_id: null, value: null,
  target_state: 'test_confirmed', previous_state: 'pending', source_label: null,
};

describe('batch review feedback', () => {
  it('shows multiple candidate values without selecting or mutating a value', () => {
    const rows = masterBatchReview([master], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toContain('候補値が2種類');
    expect(master.value).toBeNull();
    expect(master.decision_state).toBe('pending');
  });
  it('does not count completed test states as outstanding work', () => {
    for (const status of ['confirmed', 'test_confirmed', 'test_skipped'] as const) {
      expect(needsBatchReview(status)).toBe(false);
      expect(masterBatchReview([{ ...master, status, decision_state: status }], [])).toEqual([]);
    }
    expect(needsBatchReview('changed')).toBe(true);
    expect(needsBatchReview('rejected')).toBe(true);
  });
  it('keeps stale evidence and rejected decisions outside the shortcut', () => {
    expect(masterBatchReview([{ ...master, status: 'changed', decision_state: 'test_confirmed' }], [])[0].reason).toContain('再確認');
    expect(masterBatchReview([{ ...master, status: 'rejected', decision_state: 'rejected' }], [])[0].reason).toContain('変更しません');
    const missing: Master = { ...master, status: 'missing', n_candidates: 0, n_values: 0 };
    expect(masterBatchReview([missing], [])[0].reason).toContain('省略対象を確認');
    expect(masterBatchReview([missing], [document])[0].reason).toContain('省略はできません');
    expect(masterBatchReview([missing], [{ ...document, doc_role: 'output' }])[0].reason).toContain('省略対象を確認');
  });
  it('uses the server preview for exclusions, not guessed client eligibility', () => {
    const rows = masterBatchReview([master], []);
    expect(batchExclusions(rows, [target])).toEqual([]);
    expect(batchExclusions(rows, [{ ...target, scope_id: 'form_one' }])).toEqual(rows);
    expect(batchExclusions(rows, [])).toEqual(rows);
  });
  it('does not label an unverified exclusion as a known extraction error', () => {
    const rows = masterBatchReview([{ ...master, n_values: 1 }], []);
    expect(rows[0].reason).toContain('注意情報・現在の状態を個別に確認');
    expect(rows[0].reason).not.toContain('既知の誤抽出');
  });
  it('explains form fields blocked by an unresolved master', () => {
    const rows = formBatchReview([field], [master], [], 'form_one');
    expect(rows[0].scope_id).toBe('form_one');
    expect(rows[0].reason).toContain('メーカー名');
    expect(rows[0].reason).toContain('候補値が2種類');
    expect(rows[0].reason).toContain('マスター側で確認');
  });
  it('distinguishes absent mappings, missing masters and stale forms', () => {
    expect(formBatchReview([{ ...field, suggested_attr: null }], [], [], 'form_one')[0].reason).toContain('属性対応が未登録');
    expect(formBatchReview([field], [], [], 'form_one')[0].reason).toContain('対応するマスターがありません');
    expect(formBatchReview([{ ...field, suggested_attr: null }], [], [document], 'form_one')[0].reason).toContain('省略はできません');
    expect(formBatchReview([{ ...field, status: 'changed' }], [master], [], 'form_one')[0].reason).toContain('再確認が必要');
  });
  it('reports only committed server counts, including reset', () => {
    const result = { action: 'apply_with_skips', master_count: 35, form_count: 0, skipped_count: 22 };
    expect(batchResultMessage(result)).toContain('35件を処理しました（テスト確定 13件 / 入力省略 22件）');
    expect(batchResultMessage(result)).toContain('対象外の項目は変更していません');
    expect(batchResultMessage({ ...result, action: 'reset' })).toContain('35件のテスト状態を解除');
    expect(batchResultMessage({ action: 'apply', master_count: 0, form_count: 12, skipped_count: 0 })).toContain('テスト確定 12件');
  });
  it('does not invent successful counts for an unexpected result', () => {
    for (const result of [undefined, 'saved', { action: 'apply', master_count: 1, form_count: 0, skipped_count: 2 }]) {
      expect(batchResultMessage(result)).toBe('一括処理の結果は現在の状態と履歴で確認してください。');
    }
  });
  it('counts residual work from refreshed derived states, not persisted test states', () => {
    const rows = [master, { ...master, status: 'changed' as const }, { ...master, status: 'test_skipped' as const }];
    expect(batchRemainingMessage(rows)).toContain('2件');
    expect(batchRemainingMessage(undefined)).toBe('');
    expect(batchRemainingMessage([])).toContain('0件');
  });
});