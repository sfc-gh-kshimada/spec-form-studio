"use client";
import { useState } from 'react';
import { Check as CheckIcon } from 'lucide-react';
import { Button } from './ui/button';
import { BatchPanel, Check, Select, Status, TextInput } from './review-controls';
import { BulkMasterPanel } from './bulk-master-panel';
import { PdfViewer } from './pdf-viewer';
import { useBoundState, useConsent, useData, type Submit } from '@/lib/client';
import { labels, skipLabel, type Candidate, type Document, type Master } from '@/lib/model';
import { masterBatchReview } from '@/lib/batch-feedback';

export function MasterReview({ product, rows, documents, test, busy, submit, epoch, pdfEpoch }: { product: string; rows: Master[]; documents: Document[]; test: boolean; busy: boolean; submit: Submit; epoch: number; pdfEpoch: number }) {
  const [filter, setFilter] = useState('review');
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const filtered = rows.filter(row => (filter === 'all' || (filter === 'review' ? ['review', 'changed'].includes(row.status) : row.status === filter)) && `${row.attr_label} ${row.value ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const current = filtered.find(row => row.attr_key === selected) ?? filtered[0];
  return <div>
    {/* Shown regardless of test mode: confirming one attribute at a time is the
        bottleneck in a real review, and this writes the same confirmed state the
        editor below does. The test batch panel next to it writes test states. */}
    <BulkMasterPanel key={`${product}_bulk_${epoch}`} product={product} busy={busy} submit={submit} epoch={epoch} />
    {test && <BatchPanel key={`${product}_master_${epoch}`} product={product} scope="master" submit={submit} busy={busy} reviewItems={masterBatchReview(rows, documents)} />}
    <div className="review-layout">
      <section className="item-list" aria-label="マスター項目">
        <div className="list-tools"><Select label="表示" value={filter} onChange={setFilter}><option value="review">要確認・要再確認</option><option value="all">すべて</option><option value="confirmed">確認済み</option><option value="test_confirmed">テスト確定</option><option value="test_skipped">入力省略</option><option value="missing">候補なし</option><option value="rejected">却下</option></Select><TextInput label="項目を検索" value={search} onChange={setSearch} /></div>
        <div className="list-scroll">{filtered.map(row => <button className={`item-row ${current?.attr_key === row.attr_key ? 'selected' : ''}`} key={row.attr_key} onClick={() => setSelected(row.attr_key)}><span className="item-title">{row.attr_label}<Status status={row.status} /></span><span className="muted">{row.section} / 根拠 {row.n_documents}件</span>{row.status === 'review' && row.n_values > 1 && <span className="muted">候補値 {row.n_values}種類 / 一括対象外</span>}<span className="item-value">{row.status === 'test_skipped' ? skipLabel : row.value || '未確定'}</span></button>)}</div>
        {!filtered.length && <div className="empty-state">この条件の項目はありません。</div>}
      </section>
      {current ? <MasterEditor row={current} product={product} documents={documents} submit={submit} busy={busy} epoch={epoch} pdfEpoch={pdfEpoch} /> : <div className="empty-state">表示条件を切り替えてください。</div>}
    </div>
  </div>;
}
function MasterEditor({ row, product, documents, submit, busy, epoch, pdfEpoch }: { row: Master; product: string; documents: Document[]; submit: Submit; busy: boolean; epoch: number; pdfEpoch: number }) {
  const candidates = useData<Candidate[]>('candidates', { product, attr: row.attr_key });
  const binding = JSON.stringify([product, row.attr_key, row.revision, row.current_signature, epoch]);
  const [candidateId, setCandidateId] = useBoundState(binding, '');
  const [documentPath, setDocumentPath] = useState('');
  const [action, setAction] = useBoundState(binding, 'approve');
  const [value, setValue] = useBoundState(binding, '');
  const [note, setNote] = useBoundState(binding, '');
  const candidate = candidates.data?.find(item => item.candidate_id === candidateId) ?? candidates.data?.[0];
  const sources = documents.filter(item => item.doc_role === 'input');
  const document = sources.find(item => item.stage_path === documentPath) ?? sources.find(item => item.stage_path === candidate?.source_path) ?? sources[0];
  const [consent, setConsent] = useConsent([binding, product, row.attr_key, row.revision, row.current_signature, action, value, note,
    candidate?.candidate_id, candidate?.raw_value, candidate?.review_note, candidates.dataUpdatedAt, document?.stage_path, document?.version_key, document?.is_current]);
  const candidateUnavailable = action === 'approve' && (!candidate || candidates.isFetching || !!candidates.error);
  const chooseAction = (next: string) => { setAction(next); setConsent(false); setNote(''); };
  // A note is required by DECIDE_MASTER and is what source_note shows afterwards,
  // so it cannot simply be dropped. Confirming a candidate already carries its own
  // provenance, though, so an empty box is filled from the candidate or the chosen
  // original instead of blocking the button. Rejecting or reopening still needs a
  // typed reason, because nothing else records why.
  const reasonRequired = ['reject', 'reopen'].includes(action);
  const derivedNote = action === 'approve'
    ? `抽出候補を確認（${candidate?.source_label ?? '出所不明'}）`
    : `手入力で補完（${document?.original_filename ?? '原本未選択'}）`;
  const effectiveNote = note.trim() || derivedNote;
  async function save() {
    try { await submit('master', { product, attr: row.attr_key, revision: row.revision, signature: row.current_signature,
      action, candidate: action === 'approve' ? candidate?.candidate_id ?? null : null, value: action === 'manual' ? value : null, note: effectiveNote, consent }); }
    catch { setConsent(false); }
  }
  return <div className="detail-columns">
    <section className="editor-pane"><div className="section-heading"><h2>{row.attr_label}</h2><Status status={row.status} /></div>
      <p className="muted">根拠の表記 {row.n_values}種類 / revision {row.revision}</p>
      {row.status === 'review' && row.n_values > 1 && <p className="warning">一括対象外: 候補値が{row.n_values}種類あります。表記差・内容差を原本で照合して選択してください。</p>}
      {row.value && <div className="current-value"><small>現在の値</small><p>{row.value}</p><small>{row.source_note}</small></div>}
      {row.status === 'test_skipped' && <p className="warning">テスト入力省略済み。実値は未提供です。</p>}
      <Select label="操作" value={action} onChange={chooseAction} disabled={busy}><option value="approve">候補を確認して確定</option><option value="manual">手入力で補完</option><option value="reject">却下</option><option value="reopen">未確認へ戻す</option></Select>
      {action === 'approve' && <>
        {candidates.isLoading && <p role="status">候補を取得中…</p>}
        {candidates.error && <p className="error" role="alert">{candidates.error.message}</p>}
        {candidate ? <><Select label="抽出候補・顧客提供値" value={candidate.candidate_id} disabled={busy} onChange={next => { setCandidateId(next); setDocumentPath(''); setConsent(false); }}>
          {candidates.data?.map(item => <option key={item.candidate_id} value={item.candidate_id}>{item.source_label} / {item.raw_value}</option>)}
        </Select><div className="candidate-value"><small>AIの抽出候補（この値を確定します）</small>{candidate.raw_value}</div>{candidate.review_note && <p className="warning">{candidate.review_note}</p>}
          {candidate.source_kind === 'customer_master'
            ? <p className="muted">出所: 顧客提供 商品・仕入先・顧客表</p>
            : <p className="muted">出所: {candidate.source_label}（AIが原本から抽出した候補です。原本と照合してください。）</p>}</> : !candidates.isLoading && <p className="empty-state">候補がありません。</p>}
      </>}
      {action === 'manual' && <TextInput label="確認した値" value={value} multiline onChange={next => { setValue(next); setConsent(false); }} />}
      <TextInput label={reasonRequired ? '理由' : '出所・版・原本で確認した箇所（任意）'} value={note} multiline onChange={next => { setNote(next); setConsent(false); }} />
      {!reasonRequired && !note.trim() && <p className="muted">未入力のまま確定すると「{derivedNote}」として記録されます。</p>}
      <Check checked={consent} disabled={busy || candidateUnavailable} onChange={setConsent}>{reasonRequired ? 'この操作を行うことを確認した' : '値と根拠・適用条件を確認した'}</Check>
      <Button onClick={save} disabled={busy || candidateUnavailable || !consent || (reasonRequired && !note.trim()) || (action === 'manual' && !value.trim())}><CheckIcon size={16} />{busy ? '保存中…' : action === 'approve' ? 'この候補を確定' : action === 'manual' ? '手入力値を確定' : labels[action === 'reject' ? 'rejected' : 'pending'] + 'へ変更'}</Button>
    </section>
    <section className="document-pane"><h2>根拠文書</h2><Select label="原本" value={document?.stage_path ?? ''} onChange={next => { setDocumentPath(next); setConsent(false); }}>{sources.map(item => <option key={item.stage_path} value={item.stage_path}>{item.original_filename}</option>)}</Select><PdfViewer product={product} document={document} reloadKey={pdfEpoch} /></section>
  </div>;
}