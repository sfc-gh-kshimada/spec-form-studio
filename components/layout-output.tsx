"use client";
import { useEffect, useState } from 'react';
import { Download, EyeOff, FileCheck, FileSearch, ShieldAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Check, Select, TextInput } from './review-controls';
import { useConsent } from '@/lib/client';
import type { Submit } from '@/lib/client';
import type { LayoutSummary } from '@/lib/layout-model';
import type { ExportSnapshot } from '@/lib/model';

export function LayoutSelector({ product, form, busy, selected, onChange, onInfo, submit }: {
  product: string; form: string; busy: boolean;
  selected?: { id: string; version: string; hash: string; consent: true };
  onChange: (selection?: { id: string; version: string; hash: string; consent: true }) => void;
  // Reports the version on screen (or none) so the step display above can say
  // which step is next without fetching the ledger a second time.
  onInfo?: (layout?: LayoutSummary) => void;
  submit: Submit;
}) {
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [choice, setChoice] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const layout = layouts.find(item => `${item.layout_id}/${item.version}` === choice);
  const [consent, setConsent] = useConsent([product, form, choice, layout?.mapping_hash, layout?.status]);
  // Recording the visual check is a separate statement from consenting to use the
  // version, so it keeps its own note and its own checkbox.
  const [reviewNote, setReviewNote] = useState('');
  const [reviewConsent, setReviewConsent] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // What the note says when the reviewer leaves it blank. It names the version the
  // attestation is about, which is the part of the record that has to be there;
  // anything more specific is what the box is for.
  const derivedNote = layout
    ? `空様式を確認し、実物の様式と一致することを目視で確認（${layout.name} / ${layout.version}）`
    : '';
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/layout?${new URLSearchParams({ product, form })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('指定様式の台帳は未適用、または取得できません。既存のHTML/CSV出力は利用できます。'); return response.json(); })
      .then(setLayouts).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [product, form, reload]);
  useEffect(() => { onInfo?.(layout); }, [layout?.layout_id, layout?.version, layout?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // The指定様式 is what a reviewer is here to produce, so it opens selected when one
  // exists; the transcription sheet stays available as the last option. Only the
  // selection is defaulted — using the version still needs its own consent below.
  useEffect(() => {
    if (!choice && layouts.length) setChoice(`${layouts[0].layout_id}/${layouts[0].version}`);
  }, [layouts, choice]);
  // Chrome refuses to run its PDF viewer inside a sandboxed iframe in some
  // configurations, which shows as a blocked page rather than an error. Download
  // is offered as the path that never depends on the embedded viewer.
  async function showPreview(asDownload = false) {
    if (!layout || previewLoading) return;
    setPreviewLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/layout?${new URLSearchParams({ product, form, id: layout.layout_id, version: layout.version })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      if (asDownload) {
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `LAYOUT_REVIEW_${layout.layout_id}_${layout.version}.pdf`;
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else setPreview(url);
    } catch (problem) { setError((problem as Error).message); }
    finally { setPreviewLoading(false); }
  }
  return <div className="layout-output">
    <Select label="出力レイアウト" value={choice} disabled={busy || previewLoading} onChange={value => { setChoice(value); setConsent(false); onChange(undefined); setPreview(''); }}>
      {layouts.map(item => <option key={`${item.layout_id}/${item.version}`} value={`${item.layout_id}/${item.version}`}>{item.name} / {item.version} / {item.status === 'reviewed_draft' ? '下書き対応' : '確認待ち'}</option>)}
      <option value="">転記用レビュー票（HTML/CSV）</option>
    </Select>
    {layout && <><p className="muted">{layout.applicability}</p><div className="action-row"><Button variant="outline" disabled={busy || previewLoading} onClick={() => showPreview()}><FileSearch size={16} />{previewLoading ? '取得中…' : '空様式を確認'}</Button><Button variant="outline" disabled={busy || previewLoading} onClick={() => showPreview(true)}><Download size={16} />空様式をダウンロード</Button>{preview && <Button variant="outline" onClick={() => setPreview('')}><EyeOff size={16} />プレビューを閉じる</Button>}</div>
      {layout.status === 'pending'
      ? <div className="review-attest">
          {/* The only way out of 'pending'. Printing a value into a layout nobody
              has compared against the real form would present a guess as a form,
              so the empty-form buttons above are the whole of what is offered
              until someone states that the reconstruction matches. */}
          <p className="warning">レイアウト・差込欄の確認待ち。上の「空様式を確認」で実物の様式と見比べてください。照合を記録すると、下書き・テストの差込PDFとWordを出力できます（正式提出は引き続き不可）。</p>
          <TextInput label="照合した内容（欄の位置・見出し・ページ数など / 任意）" value={reviewNote} multiline
            onChange={next => { setReviewNote(next); setReviewConsent(false); }} />
          {/* REVIEW_LAYOUT stores this as the attestation's note and refuses an empty
              one, so the box cannot simply be optional: left blank it is filled from
              the version that was actually on screen, the same way the master and
              form editors derive their notes. The checkbox stays required — it is
              the whole of what takes a layout out of 'pending'. */}
          {!reviewNote.trim() && <p className="muted">未入力のまま記録すると「{derivedNote}」として記録されます。</p>}
          <Check checked={reviewConsent} disabled={busy || reviewing} onChange={setReviewConsent}>
            この帳票版が実物の様式と一致することを目視で確認した
          </Check>
          <Button variant="outline" disabled={busy || reviewing || !reviewConsent}
            onClick={async () => {
              setReviewing(true); setError('');
              try {
                await submit('layout_review', { layout: layout.layout_id, version: layout.version,
                  form, hash: layout.mapping_hash, note: reviewNote.trim() || derivedNote, consent: true });
                setReviewNote(''); setReviewConsent(false); setReload(count => count + 1);
              } catch (problem) { setError((problem as Error).message); setReviewConsent(false); }
              finally { setReviewing(false); }
            }}><FileCheck size={16} />{reviewing ? '記録中…' : '照合を記録して下書き対応にする'}</Button>
        </div>
      : <Check checked={consent && !!selected} disabled={busy} onChange={value => { setConsent(value); onChange(value ? { id: layout.layout_id, version: layout.version, hash: layout.mapping_hash, consent: true } : undefined); }}>この帳票版・適用条件を確認した（下書き・正式提出不可）</Check>}
      <ul>{layout.unsupported.map(item => <li key={item}>{item}</li>)}</ul>
    </>}
    {error && <p className="warning" role="status">{error}</p>}
    {/* No sandbox attribute: Chrome refuses to run its built-in PDF viewer inside a
        sandboxed iframe and shows 「このヘージは Chrome によってブロックされています」
        instead of the form. The previous attribute allowed both same-origin and
        scripts, which for a same-origin blob is no restriction anyway, so dropping
        it removes a broken state without removing protection. The bytes come from
        this app's own renderer over a blob URL, not from an uploaded file. */}
    {preview && <iframe title="空様式・確認待ち" src={preview} width="100%" height="650" />}
  </div>;
}

export function LayoutDownloads({ product, form, snapshot }: { product: string; form: string; snapshot: ExportSnapshot }) {
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/export?${new URLSearchParams({ product, form, id: snapshot.export_id, format: 'issues' })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error((await response.json()).error); return response.json(); })
      .then(result => setIssues(result.issues)).catch(problem => { if (!controller.signal.aborted) setError(problem.message); });
    return () => controller.abort();
  }, [product, form, snapshot.export_id]);
  async function download(format: 'pdf' | 'docx' | 'html' | 'csv', inline = false) {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/export?${new URLSearchParams({ product, form, id: snapshot.export_id, format })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      if (inline) setPreview(url);
      else {
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `${snapshot.kind === 'test_only' ? 'TEST_ONLY' : 'DRAFT'}_${product}_${form}.${format}`;
        anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (problem) { setError((problem as Error).message); }
    finally { setLoading(false); }
  }
  return <div>
    <div className="action-row"><Button variant="outline" disabled={loading} onClick={() => download('pdf', true)}><FileSearch size={16} />差込プレビュー</Button>{(['pdf', 'docx', 'html', 'csv'] as const).map(format => <Button key={format} variant="outline" disabled={loading} onClick={() => download(format)}><Download size={16} />{format === 'docx' ? 'Word' : format.toUpperCase()}</Button>)}{preview && <Button variant="outline" onClick={() => setPreview('')}><EyeOff size={16} />プレビューを閉じる</Button>}</div>
    <p className="muted">Wordはこの様式を同じ座標で再現した編集用の版です（罫線・見出し・値がそれぞれのテキストボックスになります）。編集後の内容はこの記録には戻りません。</p>
    <p className="muted">生成時点の版固定記録。後の変更・解除はこの記録を更新しません。</p>
    {!!issues.length && <details><summary>未確認・未対応: {issues.length}件</summary><ul>{issues.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    {error && <p className="error" role="alert">{error}</p>}
    {/* Unsandboxed for the same reason as the blank-form preview above. */}
    {preview && <iframe title="指定様式の下書き" src={preview} width="100%" height="650" />}
  </div>;
}

// Five steps from choosing a form to the submission file. Derived only from state
// the panel already holds, so it never claims a step the server would refuse.
export interface OutputStep { label: string; done: boolean; hint: string }
export function OutputSteps({ steps }: { steps: OutputStep[] }) {
  const current = steps.findIndex(step => !step.done);
  return <div className="output-steps">
    <ol>{steps.map((step, index) => <li key={step.label}
      className={step.done ? 'done' : index === current ? 'current' : 'locked'}
      aria-current={index === current ? 'step' : undefined}>
      <span className="step-no">{step.done ? '✓' : index + 1}</span><span>{step.label}</span></li>)}</ol>
    {current >= 0 && <p className="step-hint"><strong>次にやること：</strong>{steps[current].hint}</p>}
  </div>;
}

interface Blocker { layout_id: string; version: string; field_key: string | null; field_label: string | null; blocker: string; detail: string }const blockerLabels: Record<string, string> = {
  layout_not_adopted: '帳票版の採用待ち', layout_not_reviewed: '帳票版の確認待ち',
  field_missing: '欄が見つからない', field_version_changed: '欄の定義が変わった',
  evidence_stale: '根拠が古い', test_value_present: 'テスト値の混入',
  signature_pending: '押印・署名待ち', field_unconfirmed: '必須欄が未確認',
  rule_missing: '空欄の規則確認待ち', field_unmapped: '差込未対応の必須欄',
};

// 提出前確認と提出用PDF。両者を一つの部品にしているのは、提出できない理由を見ずに
// 提出用を押せる画面を作らないため。ブロックが1件でもあればボタンは無効で、
// サーバー側でも同じ条件で拒否する。
export function SubmissionPanel({ product, form, formName, layout, submit, onSubmitted }: {
  product: string; form: string; formName: string;
  layout?: { id: string; version: string; hash: string; consent: true };
  submit: Submit;
  onSubmitted?: () => void;
}) {
  const [blockers, setBlockers] = useState<Blocker[]>();
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [applicability, setApplicability] = useState('');
  const [adoptNote, setAdoptNote] = useState('');
  const [adoptConsent, setAdoptConsent] = useState(false);
  const scoped = layout ? (blockers ?? []).filter(item => item.layout_id === layout.id && item.version === layout.version) : blockers ?? [];
  async function load() {
    setError(''); setNote('');
    try {
      const response = await fetch(`/api/data?${new URLSearchParams({ resource: 'blockers', product, form })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      setBlockers(await response.json());
    } catch (problem) { setError((problem as Error).message); setBlockers(undefined); }
  }
  useEffect(() => { setBlockers(undefined); setNote(''); setError(''); }, [product, form]);
  // Run the check as soon as a version is chosen, so the reasons a submission is
  // blocked are on screen before anyone looks for them. Read-only.
  useEffect(() => { if (layout) void load(); }, [layout?.id, layout?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  async function createSubmission(format: 'pdf' | 'docx' = 'pdf') {
    if (!layout || busy) return;
    setBusy(true); setError(''); setNote('');
    try {
      const prepared = await fetch('/api/submission', { method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-sfs-request': '1' },
        body: JSON.stringify({ product, form, consent: true, layout }) });
      const payload = await prepared.json();
      if (!prepared.ok) {
        setError(payload.error ?? '提出用の条件を満たしていません。');
        if (Array.isArray(payload.blockers)) await load();
        return;
      }
      const id = payload.result.export_id as string;
      const rendered = await fetch(`/api/submission?${new URLSearchParams({ product, form, id, format })}`, { cache: 'no-store' });
      if (!rendered.ok) throw new Error((await rendered.json()).error);
      const url = URL.createObjectURL(await rendered.blob());
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `SUBMISSION_${product}_${form}.${format}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote(`提出用${format === 'docx' ? 'Word' : 'PDF'}を生成し、実バイトのハッシュを記録しました / ${id}`);
      onSubmitted?.();
      await load();
    } catch (problem) { setError((problem as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="submission-panel">
    <h3>⑤ 提出前確認と提出用の出力</h3>
    <p className="muted">{formName}。提出用は採用済みの帳票版だけで作れます。押印・署名は自動入力しません。1回の作成で1つの成果物を記録するため、PDFとWordの両方が必要な場合はそれぞれ作成してください。</p>
    <div className="action-row">
      <Button variant="outline" disabled={busy} onClick={load}><ShieldAlert size={16} />提出前確認をやり直す</Button>
      <Button disabled={busy || !layout || blockers === undefined || scoped.length > 0} onClick={() => createSubmission('pdf')}>
        <FileCheck size={16} />{busy ? '生成中…' : '提出用PDF'}
      </Button>
      <Button disabled={busy || !layout || blockers === undefined || scoped.length > 0} onClick={() => createSubmission('docx')}>
        <FileCheck size={16} />{busy ? '生成中…' : '提出用Word'}
      </Button>
    </div>
    {!layout && <p className="muted">提出用PDFには帳票版の選択が必要です。</p>}
    {blockers === undefined
      ? <p className="muted">{layout ? '提出条件を確認しています…' : '③で帳票版を確認すると、残っている理由を欄単位で表示します。'}</p>
      : scoped.length === 0
        ? <p className="muted">この帳票版で残っている提出条件はありません。</p>
        : <details open><summary>提出できない理由: {scoped.length}件</summary>
            <div className="batch-table"><table><thead><tr><th>区分</th><th>欄</th><th>内容</th></tr></thead>
              <tbody>{scoped.map((item, index) => <tr key={`${item.blocker}/${item.field_key ?? index}`}>
                <td>{blockerLabels[item.blocker] ?? item.blocker}</td>
                <td>{item.field_label ?? '帳票全体'}</td><td>{item.detail}</td></tr>)}</tbody></table></div>
            {/* Both layout-level reasons are about the form version, not the
                fields, so a reviewer who has just confirmed everything needs to be
                told that confirming more will not clear them. */}
            {scoped.some(item => item.blocker === 'layout_not_reviewed') && <p className="muted">「帳票版の確認待ち」は欄の確認では解消しません。上の「出力レイアウト」でこの版を選び、空様式を実物と見比べて照合を記録してください。</p>}
            {/* Adoption is the statement that this reconstruction may stand as a
                real submission, so it asks for the applicability and the reason in
                its own words rather than reusing the visual check's note. */}
            {scoped.some(item => item.blocker === 'layout_not_adopted') && (layout
              ? <div className="review-attest">
                  <p className="muted">「帳票版の採用待ち」も欄の確認では解消しません。採用すると、この版から作る提出用PDF・Wordに「正式提出不可」の表示が入らなくなります。レイアウトを作り直すと採用は自動的に外れます。</p>
                  <TextInput label="適用範囲（どの商品・どの提出先に使うか）" value={applicability} multiline
                    onChange={next => { setApplicability(next); setAdoptConsent(false); }} />
                  <TextInput label="採用の理由（実物との照合結果・確認者など）" value={adoptNote} multiline
                    onChange={next => { setAdoptNote(next); setAdoptConsent(false); }} />
                  <Check checked={adoptConsent} disabled={busy} onChange={setAdoptConsent}>
                    この帳票版を提出用として採用する（正式提出可として扱う）
                  </Check>
                  <Button variant="outline" disabled={busy || !adoptConsent || !applicability.trim() || !adoptNote.trim()}
                    onClick={async () => {
                      setBusy(true); setError(''); setNote('');
                      try {
                        await submit('layout_adopt', { layout: layout.id, version: layout.version, form,
                          hash: layout.hash, applicability: applicability.trim(), note: adoptNote.trim(), consent: true });
                        setApplicability(''); setAdoptNote(''); setAdoptConsent(false);
                        setNote('この帳票版を採用しました。もう一度「提出前確認」を押してください。');
                        await load();
                      } catch (problem) { setError((problem as Error).message); setAdoptConsent(false); }
                      finally { setBusy(false); }
                    }}><FileCheck size={16} />{busy ? '記録中…' : '採用を記録する'}</Button>
                </div>
              : <p className="muted">「帳票版の採用待ち」を解消するには、上の「出力レイアウト」でこの版を選んでください。</p>)}
          </details>}
    {note && <p className="muted" role="status">{note}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}