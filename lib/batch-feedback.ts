import { z } from 'zod';
import { labels, type BatchItem, type Document, type Field, type Master, type State } from './model';

export interface BatchReviewItem {
  scope_id: string;
  field_key: string;
  label: string;
  status: State;
  reason: string;
}

export function needsBatchReview(status: State): boolean {
  return !['confirmed', 'test_confirmed', 'test_skipped'].includes(status);
}

export function masterBatchReview(rows: Master[], documents: Document[]): BatchReviewItem[] {
  const staleInput = documents.some(document => document.doc_role === 'input' && !document.is_current);
  return rows.filter(row => needsBatchReview(row.status)).map(row => {
    let reason = '一括条件に一致しません。候補の注意情報・現在の状態を個別に確認してください。';
    if (row.status === 'changed') reason = '根拠が更新されています。原本の再確認が必要です。';
    else if (row.decision_state === 'rejected') reason = '却下済みのため、一括処理では変更しません。';
    else if (row.n_values > 1) reason = `候補値が${row.n_values}種類あります。原本を照合して選択してください。`;
    else if (row.n_candidates === 0) reason = staleInput
      ? '根拠文書に更新があります。候補なしの入力省略はできません。'
      : '候補がありません。「候補なしの入力もテスト用に省略」を選ぶと省略対象を確認できます。';
    return { scope_id: 'master', field_key: row.attr_key, label: row.attr_label, status: row.status, reason };
  });
}

export function formBatchReview(rows: Field[], masters: Master[], documents: Document[], form: string): BatchReviewItem[] {
  const staleInput = documents.some(document => document.doc_role === 'input' && !document.is_current);
  return rows.filter(row => needsBatchReview(row.status)).map(row => {
    const master = masters.find(item => item.attr_key === row.suggested_attr);
    let reason = '一括条件に一致しません。欄の状態・転記元を個別に確認してください。';
    if (row.status === 'changed') reason = '帳票・転記元・原本の版または状態が変わっています。再確認が必要です。';
    else if (master && ['review', 'changed', 'rejected', 'pending'].includes(master.status)) {
      reason = `転記元「${master.attr_label}」が${labels[master.status]}です。`;
      if (master.n_values > 1) reason += `候補値が${master.n_values}種類あります。`;
      reason += 'マスター側で確認してください。';
    } else if (!row.suggested_attr || (master && ['missing', 'test_skipped'].includes(master.status))) {
      reason = staleInput
        ? '根拠文書に更新があります。転記値なしの入力省略はできません。'
        : '転記値がないか、属性対応が未登録です。「転記値なし・対応未登録の入力も省略」で対象を確認できます。';
    } else if (!master) reason = '対応するマスターがありません。属性対応を個別に確認してください。';
    return { scope_id: form, field_key: row.field_key, label: row.field_label, status: row.status, reason };
  });
}

export function batchExclusions(rows: BatchReviewItem[], preview: BatchItem[]): BatchReviewItem[] {
  const targets = new Set(preview.map(row => JSON.stringify([row.scope_id, row.field_key])));
  return rows.filter(row => !targets.has(JSON.stringify([row.scope_id, row.field_key])));
}

const batchResult = z.object({
  action: z.enum(['apply', 'apply_with_skips', 'reset']),
  master_count: z.number().int().nonnegative(),
  form_count: z.number().int().nonnegative(),
  skipped_count: z.number().int().nonnegative(),
}).refine(result => result.skipped_count <= result.master_count + result.form_count);

export function batchResultMessage(value: unknown): string {
  const parsed = batchResult.safeParse(value);
  if (!parsed.success) return '一括処理の結果は現在の状態と履歴で確認してください。';
  const result = parsed.data;
  const count = result.master_count + result.form_count;
  if (result.action === 'reset') return `${count}件のテスト状態を解除しました。個別確認値・履歴・過去の出力は保持しています。`;
  return `${count}件を処理しました（テスト確定 ${count - result.skipped_count}件 / 入力省略 ${result.skipped_count}件）。対象外の項目は変更していません。`;
}

export function batchRemainingMessage(rows: { status: State }[] | undefined): string {
  if (!rows) return '';
  const remaining = rows.filter(row => needsBatchReview(row.status)).length;
  return `現在の対象範囲で未確認・要再確認などは${remaining}件です。`;
}