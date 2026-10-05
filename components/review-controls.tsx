"use client";
import { useId, useState } from 'react';
import { CheckCheck, ClipboardList, Undo2 } from 'lucide-react';
import { Button } from './ui/button';
import { readData, type Submit } from '@/lib/client';
import { labels, skipLabel, type BatchItem, type State } from '@/lib/model';
import { batchExclusions, type BatchReviewItem } from '@/lib/batch-feedback';

export function Status({ status }: { status: State }) { return <span className={`state state-${status}`}>{labels[status]}</span>; }
export function Check({ children, checked, onChange, disabled = false }: { children: React.ReactNode; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{children}</span></label>;
}
export function Select({ label, value, onChange, children, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return <label className="control" htmlFor={id}><span>{label}</span><select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
export function TextInput({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const id = useId();
  return <label className="control" htmlFor={id}><span>{label}</span>{multiline ? <textarea id={id} rows={4} maxLength={16000} value={value} onChange={event => onChange(event.target.value)} /> : <input id={id} maxLength={4000} value={value} onChange={event => onChange(event.target.value)} />}</label>;
}
export function BatchPanel({ product, scope, submit, busy, reset = false, reviewItems = [] }: { product: string; scope: string; submit: Submit; busy: boolean; reset?: boolean; reviewItems?: BatchReviewItem[] }) {
  const [skips, setSkips] = useState(false);
  const [preview, setPreview] = useState<BatchItem[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const action = reset ? 'reset' : skips ? 'apply_with_skips' : 'apply';
  const skipped = preview?.filter(row => (reset ? row.previous_state : row.target_state) === 'test_skipped').length ?? 0;
  const excluded = preview && !reset ? batchExclusions(reviewItems, preview) : [];
  async function load() {
    setLoading(true); setError(''); setConsent(false); setPreview(null);
    try { setPreview(await readData<BatchItem[]>('batch', { product, scope, action })); }
    catch (problem) { setError((problem as Error).message); }
    finally { setLoading(false); }
  }
  async function apply() {
    if (!preview || !consent) return;
    try {
      await submit('batch', { product, scope, action, consent, items: preview.map(({ scope_id, field_key, revision, signature, candidate_id }) => ({ scope_id, field_key, revision, signature, candidate_id })) });
      setPreview(null); setConsent(false);
    } catch { setConsent(false); }
  }
  return <details className="batch-panel" open={!reset}>
    <summary>{reset ? 'この商品のテスト状態を解除' : scope === 'master' ? 'マスターのテスト一括処理' : '様式のテスト一括処理'}</summary>
    <div className="batch-content">
      <p className="muted">{reset ? '個別確認値・履歴・過去の出力は保持します。' : '内容未確認・正式提出不可。全項目の確定ではなく、対象一覧だけを処理します。候補値が複数・既知の誤抽出・要再確認は残ります。'}</p>
      {!reset && <Check checked={skips} disabled={busy || loading} onChange={value => { setSkips(value); setPreview(null); setConsent(false); }}>{scope === 'master' ? '候補なしの入力もテスト用に省略' : '転記値なし・対応未登録の入力も省略'}</Check>}
      <Button variant="outline" disabled={loading || busy} onClick={load}><ClipboardList size={16} />{loading ? '取得中…' : reset ? '解除対象を表示' : '一括対象を表示'}</Button>
      {error && <p role="alert" className="error">{error}</p>}
      {preview && !reset && <p role="status">処理対象 <strong>{preview.length}件</strong> / 今回も残る未確認・要再確認など <strong>{excluded.length}件</strong>（対象取得時点）</p>}
      {!!excluded.length && <details className="batch-exclusions"><summary>一括対象外の項目と理由: {excluded.length}件</summary><div className="batch-table"><table><thead><tr><th>項目</th><th>状態</th><th>対象外の理由・確認先</th></tr></thead><tbody>{excluded.map(row => <tr key={`${row.scope_id}_${row.field_key}`}><td>{row.label}</td><td><Status status={row.status} /></td><td>{row.reason}</td></tr>)}</tbody></table></div></details>}
      {preview?.length === 0 && <p>対象項目はありません。</p>}
      {!!preview?.length && <>
        <p><strong>{preview.length}件</strong> / 入力省略 {skipped}件</p>
        <div className="batch-table"><table><thead><tr><th>対象・項目</th><th>値・省略表示</th><th>区分</th></tr></thead><tbody>{preview.map(row => <tr key={`${row.scope_id}_${row.field_key}`}><td><small>{row.scope_id}</small>{row.label}</td><td>{(reset ? row.previous_state : row.target_state) === 'test_skipped' ? skipLabel : row.value}</td><td><Status status={reset ? row.previous_state : row.target_state} /></td></tr>)}</tbody></table></div>
        <Check checked={consent} disabled={busy} onChange={setConsent}>内容未確認のテスト処理であり、正式提出には使わない</Check>
        <Button disabled={!consent || busy} onClick={apply}>{reset ? <Undo2 size={16} /> : <CheckCheck size={16} />}{busy ? '処理中…' : reset ? 'テスト状態を未確認へ戻す' : `${preview.length}件をテスト用に一括処理`}</Button>
      </>}
    </div>
  </details>;
}