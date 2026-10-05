"use client";
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check as CheckIcon, Download, FileOutput, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { BatchPanel, Check, Select, Status, TextInput } from './review-controls';
import { PdfViewer } from './pdf-viewer';
import { readData, useBoundState, useConsent, useData, type Submit } from '@/lib/client';
import { displayValue, type Document, type ExportSnapshot, type Field, type Form, type Master } from '@/lib/model';
import { exportCsv, exportHtml } from '@/lib/exports';
import { LayoutDownloads, LayoutSelector, OutputSteps, SubmissionPanel } from './layout-output';
import type { LayoutSummary } from '@/lib/layout-model';
import { BulkFormPanel } from './bulk-form-panel';
import { formBatchReview, needsBatchReview } from '@/lib/batch-feedback';

export function FormReview({ product, name, masters, documents, test, busy, submit, epoch, pdfEpoch }: { product: string; name: string; masters: Master[]; documents: Document[]; test: boolean; busy: boolean; submit: Submit; epoch: number; pdfEpoch: number }) {
  const forms = useData<Form[]>('forms', { product });
  const [other, setOther] = useState(false);
  const [selected, setSelected] = useState('');
  const available = forms.data?.filter(form => other || form.is_designated) ?? [];
  // Opens on the first form when nothing has been picked.
  const form = available.find(item => item.form_id === selected) ?? available[0];
  return <section>
    <div className="form-selector"><Select label="取引先・様式" value={form?.form_id ?? ''} onChange={setSelected}>{available.map(item => <option key={item.form_id} value={item.form_id}>{item.customer} / {item.form_name}</option>)}</Select><Check checked={other} onChange={setOther}>提出実績のない取引先も表示</Check></div>
    {forms.isLoading && <p role="status">様式を取得中…</p>}{forms.error && <p className="error" role="alert">{forms.error.message}</p>}
    {!forms.isLoading && !form && <p className="empty-state">この商品の提出先に対応した様式は未登録です。</p>}
    {form && <FormFields key={form.form_id} {...{ product, name, form, masters, documents, test, busy, submit, epoch, pdfEpoch }} />}
  </section>;
}
function FormFields({ product, name, form, masters, documents, test, busy, submit, epoch, pdfEpoch }: { product: string; name: string; form: Form; masters: Master[]; documents: Document[]; test: boolean; busy: boolean; submit: Submit; epoch: number; pdfEpoch: number }) {
  const fields = useData<Field[]>('fields', { product, form: form.form_id });
  const references = useData<{ stage_path: string }[]>('references', { product, form: form.form_id });
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('all');
  const visible = fields.data?.filter(row => filter === 'all' || (filter === 'review' ? !['confirmed', 'test_confirmed', 'test_skipped'].includes(row.status) : row.status === filter)) ?? [];
  const field = visible.find(item => item.field_key === selected) ?? visible[0];
  const samples = documents.filter(doc => references.data?.some(item => item.stage_path === doc.stage_path));
  const reviewZone = useRef<HTMLDivElement>(null);
  const outputZone = useRef<HTMLDivElement>(null);
  const jump = (zone: typeof reviewZone) => zone.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const remaining = fields.data?.filter(row => !['confirmed', 'test_confirmed', 'test_skipped'].includes(row.status)).length;
  return <>
    {/* The page holds two jobs: checking each field (A) and producing files (B).
        The bar stays on screen so either is one click away from anywhere. */}
    <nav className="zone-nav" aria-label="ページ内の移動">
      <button type="button" onClick={() => jump(reviewZone)}><span>A</span>様式レビュー（欄の確認）</button>
      <button type="button" onClick={() => jump(outputZone)}><span>B</span>出力（PDF・Word）<ArrowDown size={14} /></button>
    </nav>
    <div className="zone" ref={reviewZone}>
    <div className="zone-heading"><h2><span>A</span>様式レビュー（欄の確認）</h2><p className="muted">様式の各欄に入れる値を確認します。テスト値で下書きを出すだけなら、ここを飛ばして B へ進めます。</p></div>
    <div className="summary-line"><span>欄数 <strong>{fields.data?.length ?? '…'}</strong></span><span>確認済み <strong>{fields.data?.filter(row => row.status === 'confirmed').length ?? 0}</strong></span><span>必須欄・正式確認前 <strong>{fields.data?.filter(row => row.required && row.status !== 'confirmed').length ?? 0}</strong></span><span>テスト確定 {fields.data?.filter(row => row.status === 'test_confirmed').length ?? 0}</span><span>入力省略 {fields.data?.filter(row => row.status === 'test_skipped').length ?? 0}</span>{test && <span>テスト未処理・要再確認 <strong>{fields.data?.filter(row => needsBatchReview(row.status)).length ?? 0}</strong></span>}</div>
    {/* Shown regardless of test mode, like the master panel: this writes the same
        confirmed state the editor below does. The test batch panel next to it
        writes test states instead. */}
    <BulkFormPanel key={`${form.form_id}_bulk_${epoch}`} product={product} form={form.form_id}
      fields={fields.data ?? []} masters={masters} documents={documents} submit={submit} epoch={epoch}
      busy={busy || fields.isFetching || !!fields.error} />
    {test && <BatchPanel key={`${form.form_id}_${epoch}`} product={product} scope={form.form_id} submit={submit} busy={busy || fields.isFetching || !!fields.error} reviewItems={formBatchReview(fields.data ?? [], masters, documents, form.form_id)} />}
    {fields.error && <p className="error" role="alert">{fields.error.message}</p>}
    <div className="review-layout"><section className="item-list" aria-label="様式項目"><div className="list-tools"><Select label="欄の表示" value={filter} onChange={setFilter}><option value="all">すべて</option><option value="review">未確認・要再確認</option><option value="confirmed">確認済み</option><option value="test_skipped">入力省略</option></Select></div><div className="list-scroll">
      {visible.map(row => <button key={row.field_key} className={`item-row ${field?.field_key === row.field_key ? 'selected' : ''}`} onClick={() => setSelected(row.field_key)}><span className="item-title">{row.field_label}<Status status={row.status} /></span><span className="muted">{row.section}{row.required ? ' / 必須（抽出）' : ''}</span><span className="item-value">{displayValue(row, test) || '未確定'}</span></button>)}
    </div></section>
      {field && <FieldEditor {...{ product, field, masters, documents, samples, submit, epoch, pdfEpoch }} busy={busy || fields.isFetching || !!fields.error} form={form.form_id} />}
    </div>
    {references.error && <p className="error" role="alert">提出済みサンプルを取得できませんでした。</p>}
    <div className="zone-exit"><span className="muted">{remaining === undefined ? '' : remaining ? `未確認・要再確認の欄: ${remaining}件` : 'すべての欄を処理済みです。'}</span><Button variant="outline" onClick={() => jump(outputZone)}><ArrowDown size={16} />B 出力へ進む</Button></div>
    </div>
    <div className="zone" ref={outputZone}>
    <ExportPanel key={`${product}_${form.form_id}_${test}`} {...{ product, name, form, test, submit }} busy={busy || fields.isFetching || !!fields.error} onBack={() => jump(reviewZone)} />
    </div>
  </>;
}
function FieldEditor({ product, form, field, masters, documents, samples, submit, busy, epoch, pdfEpoch }: { product: string; form: string; field: Field; masters: Master[]; documents: Document[]; samples: Document[]; submit: Submit; busy: boolean; epoch: number; pdfEpoch: number }) {
  const binding = JSON.stringify([product, form, field.field_key, field.revision, field.current_template_signature, epoch]);
  const [mode, setMode] = useBoundState(binding, 'master');
  const confirmed = masters.filter(row => row.status === 'confirmed');
  const [attr, setAttr] = useBoundState(binding, field.suggested_attr ?? '');
  const master = confirmed.find(row => row.attr_key === attr);
  const sources = documents.filter(doc => doc.is_current && doc.stage_path.endsWith('.pdf'));
  const [source, setSource] = useState('');
  const [sample, setSample] = useState('');
  const sourceDoc = sources.find(doc => doc.stage_path === source) ?? sources.find(doc => doc.doc_role === 'input') ?? sources[0];
  const sampleDoc = samples.find(doc => doc.stage_path === sample) ?? samples[0];
  const [value, setValue] = useBoundState(binding, '');
  const [note, setNote] = useBoundState(binding, '');
  const [consent, setConsent] = useConsent([binding, product, form, field.field_key, field.revision, field.current_template_signature,
    mode, value, note, master?.attr_key, master?.revision, master?.current_signature, master?.status, master?.value,
    sourceDoc?.stage_path, sourceDoc?.version_key, sourceDoc?.is_current, sampleDoc?.stage_path, sampleDoc?.version_key]);
  // DECIDE_FORM requires a note and stores it as the field's source_note, so an
  // empty box is filled from what was actually chosen rather than blocking the
  // button. Reopening still needs a typed reason: nothing else records why a
  // confirmed field was taken back.
  const reasonRequired = mode === 'reopen';
  const derivedNote = mode === 'master'
    ? `確定マスターから転記（${master?.attr_label ?? '属性未選択'}）`
    : `原本から補完（${sourceDoc?.original_filename ?? '原本未選択'}）`;
  const effectiveNote = note.trim() || derivedNote;
  async function save() {
    try { await submit('form', { product, form, field: field.field_key, revision: field.revision, template: field.current_template_signature,
      attr: mode === 'master' ? master?.attr_key ?? null : null, masterRevision: mode === 'master' ? master?.revision ?? null : null,
      value: mode === 'source' ? value : null, source: mode === 'source' ? sourceDoc?.stage_path ?? null : null,
      sourceVersion: mode === 'source' ? sourceDoc?.version_key ?? null : null, note: effectiveNote, consent, action: mode === 'reopen' ? 'reopen' : 'confirm' }); }
    catch { setConsent(false); }
  }
  return <div className="detail-columns"><section className="editor-pane"><div className="section-heading"><h2>{field.field_label}</h2><Status status={field.status} /></div><p className="guidance">{field.guidance}</p><p className="muted">属性対応案: {field.suggested_attr || '未登録'}</p>
    {field.status === 'test_skipped' && <p className="warning">テスト入力省略済み。値を入力せずテスト出力へ進めます。</p>}
    <Select label="値の出所・操作" value={mode} disabled={busy} onChange={next => { setMode(next); setConsent(false); setNote(''); }}><option value="master">確定マスター</option><option value="source">原本から補完</option><option value="reopen">未確認へ戻す</option></Select>
    {mode === 'master' && <><Select label="転記する属性" value={master?.attr_key ?? ''} disabled={busy} onChange={next => { setAttr(next); setConsent(false); }}><option value="">確認済み属性を選択</option>{confirmed.map(row => <option key={row.attr_key} value={row.attr_key}>{row.attr_label}: {row.value}</option>)}</Select>{master ? <div className="candidate-value"><small>この欄に転記される値</small>{master.value}</div> : <p className="empty-state">この欄へ転記する確認済み属性を選択してください。</p>}{master && <p className="muted">出所: 01 で確定した「{master.attr_label}」。この値が提出PDFのこの欄に入ります。</p>}</>}
    {mode === 'source' && <><Select label="出所となる文書" value={sourceDoc?.stage_path ?? ''} onChange={next => { setSource(next); setConsent(false); }}>{sources.map(doc => <option key={doc.stage_path} value={doc.stage_path}>{doc.doc_role === 'output' ? '過去の提出済み / ' : ''}{doc.original_filename}</option>)}</Select>{sourceDoc?.doc_role === 'output' && <p className="warning">過去の提出値です。現在の適用条件を確認してください。</p>}<TextInput label="原本で確認した値" value={value} multiline onChange={next => { setValue(next); setConsent(false); }} /></>}
    <TextInput label={reasonRequired ? '取り消す理由' : '欄の意味・単位・確認箇所（任意）'} value={note} multiline onChange={next => { setNote(next); setConsent(false); }} />
    {!reasonRequired && !note.trim() && <p className="muted">未入力のまま確定すると「{derivedNote}」として記録されます。</p>}
    <Check checked={consent} disabled={busy} onChange={setConsent}>{mode === 'reopen' ? '確認を取り消すことを確認した' : 'この欄への転記と適用条件を確認した'}</Check>
    <Button onClick={save} disabled={busy || !consent || (reasonRequired && !note.trim()) || (mode === 'master' && !master) || (mode === 'source' && (!sourceDoc || !value.trim()))}><CheckIcon size={16} />{busy ? '保存中…' : mode === 'reopen' ? '未確認へ戻す' : 'この欄を確定'}</Button>
  </section><section className="document-pane"><h2>{mode === 'source' ? '補完値の根拠文書' : '提出済みサンプル'}</h2>{mode !== 'source' && <Select label="提出済み原本" value={sampleDoc?.stage_path ?? ''} onChange={setSample}>{samples.map(doc => <option key={doc.stage_path} value={doc.stage_path}>{doc.original_filename}</option>)}</Select>}<PdfViewer product={product} document={mode === 'source' ? sourceDoc : sampleDoc} reloadKey={pdfEpoch} /></section></div>;
}
function ExportPanel({ product, name, form, test, busy, submit, onBack }: { product: string; name: string; form: Form; test: boolean; busy: boolean; submit: Submit; onBack: () => void }) {
  // Read from the shared query cache rather than threading the qualified name
  // down three components; the header already fetched this resource.
  const session = useData<{ data_schema?: string }>('session');
  const sourceTable = session.data?.data_schema ? `${session.data.data_schema}.EXPORT_HISTORY` : undefined;
  const [includeTest, setIncludeTest] = useState(false);
  const [snapshot, setSnapshot] = useState<ExportSnapshot>();
  const [layout, setLayout] = useState<{ id: string; version: string; hash: string; consent: true }>();
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoNote, setDemoNote] = useState('');
  const [info, setInfo] = useState<LayoutSummary>();
  const [submitted, setSubmitted] = useState(false);
  const steps = [
    { label: '様式を選ぶ', done: !!info, hint: '下の「① 出力レイアウト」で使う帳票版を選んでください。HTML/CSVの転記用レビュー票だけが必要なら、この手順は不要です。' },
    { label: '空様式を実物と照合', done: !!info && info.status !== 'pending', hint: '「空様式を確認」で実物の様式と見比べ、「照合を記録して下書き対応にする」を押してください（版ごとに1回）。' },
    { label: '適用条件を確認', done: !!layout, hint: '「この帳票版・適用条件を確認した」にチェックを入れてください。差込のボタンが使えるようになります。' },
    { label: '下書き（テスト値）を出力', done: !!snapshot?.layout, hint: '「④ 下書きを出力」のボタンで差込PDF・Wordを出し、中身を確かめてください。正式提出不可の表示が入ります。' },
    { label: '提出前確認・提出用を出力', done: submitted, hint: '「⑤ 提出前確認」に残っている理由を解消すると、提出用PDF・Wordを作れます。欄の理由は A 様式レビューで解消します。' },
  ];
  // Demo path: fills the form with test values and produces the layout output in
  // one click, so a walkthrough does not have to confirm every master value first.
  // It uses the existing test batch and test export, so every page carries the
  // テスト専用・内容未確認・正式提出不可 marking and no value is presented as confirmed.
  async function demoTest(format: 'pdf' | 'docx') {
    if (!layout || demoBusy) return;
    setDemoBusy(true); setDemoNote('');
    try {
      for (const scope of ['master', form.form_id]) {
        const items = await readData<{ scope_id: string; field_key: string; revision: number; signature: string; candidate_id: string | null }[]>(
          'batch', { product, scope, action: 'apply_with_skips' });
        if (items.length) {
          await submit('batch', { product, scope, action: 'apply_with_skips', consent: true,
            items: items.map(({ scope_id, field_key, revision, signature, candidate_id }) => ({ scope_id, field_key, revision, signature, candidate_id })) });
        }
      }
      const prepared = await submit('export', { product, form: form.form_id, kind: 'test_only', consent: true, layout }) as ExportSnapshot;
      setIncludeTest(true);
      setSnapshot(prepared);
      const response = await fetch(`/api/export?${new URLSearchParams({ product, form: form.form_id, id: prepared.export_id, format })}`, { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `TEST_ONLY_${product}_${form.form_id}.${format}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDemoNote(`テスト値で差込${format === 'docx' ? 'Word' : 'PDF'}を生成しました。テスト専用・正式提出不可の表示が入ります。`);
    } catch (problem) { setDemoNote((problem as Error).message); }
    finally { setDemoBusy(false); }
  }
  async function generate() {
    try { setSnapshot(await submit('export', { product, form: form.form_id, kind: includeTest ? 'test_only' : 'review_only', consent: true, ...(layout ? { layout } : {}) }) as ExportSnapshot); }
    catch { setSnapshot(undefined); }
  }
  function download(format: 'html' | 'csv') {
    if (!snapshot) return;
    const content = format === 'html' ? exportHtml(snapshot, name, form.form_name, sourceTable) : exportCsv(snapshot);
    const url = URL.createObjectURL(new Blob([content], { type: format === 'html' ? 'text/html;charset=utf-8' : 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${snapshot.kind === 'test_only' ? 'TEST_ONLY' : 'review'}_${product}_${form.form_id}.${format}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // HTML and CSV are built in the browser from the snapshot already on screen.
  // Word is built on the server, because writing the .docx package needs node:zlib.
  async function downloadDocx() {
    if (!snapshot) return;
    const response = await fetch(`/api/export?${new URLSearchParams({ product, form: form.form_id, id: snapshot.export_id, format: 'docx' })}`, { cache: 'no-store' });
    if (!response.ok) { setDemoNote((await response.json()).error); return; }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `${snapshot.kind === 'test_only' ? 'TEST_ONLY' : 'DRAFT'}_${product}_${form.form_id}.docx`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="export-panel"><div className="zone-heading"><h2><span>B</span>出力（PDF・Word）</h2><Button variant="ghost" onClick={onBack}><ArrowUp size={16} />A 様式レビューへ戻る</Button></div>
    <OutputSteps steps={steps} />
    {test && <Check checked={includeTest} disabled={busy} onChange={next => { setIncludeTest(next); setSnapshot(undefined); }}>テスト確定値・入力省略を含むテスト出力</Check>}
    <h3 className="step-title">①②③ 出力レイアウトの選択・照合・確認</h3>
    <LayoutSelector {...{ product, busy, submit }} form={form.form_id} selected={layout} onInfo={setInfo} onChange={value => { setLayout(value); setSnapshot(undefined); }} />
    {includeTest && <p className="warning">テスト専用・内容未確認・正式提出不可。値未提供の欄は実値ではありません。</p>}
    {/* One group for every output action. They used to sit in three separate rows
        with the submission panel between them, which made it unclear which button
        to press for a test PDF. Order follows the walkthrough: one-click test PDF,
        then the review sheet, then its downloads, then the pre-submission check. */}
    <div className="output-actions">
      <small>④ 下書きを出力{layout ? '' : '（③まで終えると差込PDF・Wordを出せます）'}</small>
      <div className="action-row">
        {layout && <Button disabled={busy || demoBusy} onClick={() => demoTest('pdf')}><Zap size={16} />{demoBusy ? '生成中…' : 'テスト値で差込PDFを出力'}</Button>}
        {layout && <Button disabled={busy || demoBusy} onClick={() => demoTest('docx')}><Zap size={16} />{demoBusy ? '生成中…' : 'テスト値で差込Wordを出力'}</Button>}
        <Button variant="outline" disabled={busy} onClick={generate}><FileOutput size={16} />{busy ? '生成中…' : layout ? '差込なしで下書きを記録' : includeTest ? '転記用テストレビュー票（HTML/CSV）を作成' : '転記用レビュー票（HTML/CSV）を作成'}</Button>
        {snapshot && !snapshot.layout && <><Button variant="outline" onClick={() => download('html')}><Download size={16} />HTML</Button><Button variant="outline" onClick={() => download('csv')}><Download size={16} />CSV</Button><Button variant="outline" onClick={downloadDocx}><Download size={16} />Word</Button></>}
      </div>
      {!layout && <p className="muted">転記用レビュー票は正式提出不可で、指定のExcel・Word様式ではありません。</p>}
      {demoNote && <p className="warning" role="status">{demoNote}</p>}
      <SubmissionPanel product={product} form={form.form_id} formName={form.form_name} layout={layout} submit={submit} onSubmitted={() => setSubmitted(true)} />
    </div>
    {snapshot?.layout && <LayoutDownloads key={snapshot.export_id} product={product} form={form.form_id} snapshot={snapshot} />}
    {snapshot && <><p className="muted">生成時点の記録 / <code>{snapshot.export_id}</code></p><div className="batch-table"><table><thead><tr><th>欄</th><th>値</th><th>状態</th></tr></thead><tbody>{snapshot.rows.map(row => <tr key={row.field_key}><td>{row.label}</td><td>{displayValue(row, snapshot.kind === 'test_only')}</td><td><Status status={row.status} /></td></tr>)}</tbody></table></div></>}
  </section>;
}