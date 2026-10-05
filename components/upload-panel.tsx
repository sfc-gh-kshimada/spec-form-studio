"use client";
import { useState } from 'react';
import { FilePlus2, ScrollText, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Check, Select, TextInput } from './review-controls';
import { TranscriptView, type TranscriptPage } from './transcript-view';
import { readData, useBoundState, useConsent } from '@/lib/client';
import type { Product } from '@/lib/model';

type Impact = { product_slug: string; n_decided: number; n_confirmed: number; n_test: number };
type UploadRow = { stage_path: string; original_filename: string; doc_type: string; doc_role: string;
  upload_purpose?: string;
  n_extract: number; n_gap: number; n_candidates: number };
type Registered = { path: string; original_filename: string; doc_type: string; product: string;
  decided_before: number; extension: string; rendition: string | null; sheets: number | null };
type Transcript = { pages: TranscriptPage[]; cached: boolean; elapsed: number; source: string; mode: string };
// Read-only view of what the AI extracted from one document. Tab 03 shows these
// so a structuring test can be judged on the spot; confirming a value stays in
// tabs 01 and 02, which read the production-only views.
type Extracted = { attr_key: string; attr_label: string; raw_value: string | null;
  source_label: string | null; is_primary: boolean };

const kinds: [string, string][] = [
  ['spec', '規格書・品質規格書'],
  ['sds', 'SDS（安全データシート）'],
  ['coa', '試験成績書・分析証明書'],
  ['catalog', 'カタログ・技術資料'],
  ['form', '提出用の様式（根拠には使わない）'],
];

function suggestKey() {
  return `sample_${Date.now().toString(36)}`;
}

// Adds one document that was handed over during a meeting. Registration and
// structuring are separate steps so the effect on already-confirmed values is
// shown before any AI call is made.
export function UploadPanel({ products, current, busy, onIngested, purpose = 'production' }: {
  products: Product[]; current: string; busy: boolean;
  onIngested: (product: string) => Promise<boolean>;
  // 'test' registers the document for a structuring test: it is stored in the
  // same schema but excluded from the master and form reviews. Adding a product
  // is still allowed — the product row is a production record either way, and a
  // newly added one stays visible in the sidebar through the ingested list.
  purpose?: 'production' | 'test';
}) {
  const testUpload = purpose === 'test';
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState(testUpload ? 'existing' : 'new');
  const [slug, setSlug] = useState(suggestKey);
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [submitTo, setSubmitTo] = useState('');
  const [existing, setExisting] = useBoundState('current:' + current, current);
  const [docType, setDocType] = useState('spec');
  const [impact, setImpact] = useState<Impact | null>(null);
  // Documents already on the upload stage for this product. Structuring is
  // otherwise reachable only in the same visit as the upload, which strands a
  // document whose structuring failed: re-uploading it is refused as a duplicate.
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [selected, setSelected] = useState<{ path: string; mode: 'structure' | 'restructure' } | null>(null);
  // Set when a registration is refused as a duplicate, so the list can be shown
  // for the product that already owns the document.
  const [duplicateOwner, setDuplicateOwner] = useState('');
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [extracted, setExtracted] = useState<{ path: string; rows: Extracted[] } | null>(null);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const newProduct = mode === 'new';
  const product = newProduct ? slug : existing;
  const keyValid = /^[a-z0-9_]+$/.test(product);
  const [consent, setConsent] = useConsent([file?.name, file?.size, mode, product, name, supplier, submitTo, docType, impact?.n_decided, registered?.path]);
  const [rerunConsent, setRerunConsent] = useConsent([selected?.path, selected?.mode]);
  const locked = busy || working;

  async function loadImpact(target: string) {
    setImpact(null);
    if (!/^[a-z0-9_]+$/.test(target)) return;
    try {
      const rows = await readData<Impact[]>('upload_impact', { product: target });
      setImpact(rows[0] ?? { product_slug: target, n_decided: 0, n_confirmed: 0, n_test: 0 });
    } catch (problem) { setError((problem as Error).message); }
    await loadUploads(target);
  }
  async function loadUploads(target: string) {
    setSelected(null);
    if (!/^[a-z0-9_]+$/.test(target)) { setUploads([]); return; }
    try { setUploads(await readData<UploadRow[]>('uploads', { product: target })); }
    catch (problem) { setError((problem as Error).message); }
  }
  // Loaded on demand rather than with the list: one document's candidates are only
  // wanted when someone asks for them, and a structuring run can produce dozens.
  async function loadExtraction(path: string, target?: string) {
    setError('');
    try {
      const rows = await readData<Extracted[]>('extraction', { product: target ?? product, path });
      setExtracted({ path, rows });
    } catch (problem) { setError((problem as Error).message); }
  }  function chooseMode(next: string) {
    setMode(next); setConsent(false); setRegistered(null); setReceipt(null); setTranscript(null); setError(''); setImpact(null);
    if (next === 'existing') void loadImpact(existing);
  }
  function chooseExisting(next: string) {
    setExisting(next); setConsent(false); setRegistered(null); setReceipt(null); setTranscript(null); void loadImpact(next);
  }
  function reset() {
    setFile(null); setRegistered(null); setReceipt(null); setTranscript(null); setError(''); setConsent(false);
    setDuplicateOwner('');
    setSlug(suggestKey()); setName(''); setSupplier(''); setSubmitTo(''); setStage('');
  }

  async function upload() {
    if (!file || !consent || !keyValid) return;
    setWorking(true); setError(''); setReceipt(null); setTranscript(null); setStage('原本をアップロードしています…');
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('meta', JSON.stringify({
        product, productName: newProduct ? name.trim() : null,
        supplier: supplier.trim() || null, submitTo: submitTo.trim() || null,
        docType, newProduct, consent: true, uploadPurpose: purpose,
      }));
      const response = await fetch('/api/upload', { method: 'POST', headers: { 'X-SFS-Request': '1' }, body, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '登録結果を確認できません。');
      const result = payload.result as { product: string; doc_type: string; decided_before: number };
      const rendered = payload.rendered as { render_path?: string; sheets?: number } | undefined;
      setRegistered({ path: payload.path, original_filename: payload.original_filename,
        doc_type: result.doc_type, product: result.product, decided_before: result.decided_before,
        extension: String(payload.extension ?? 'pdf'),
        rendition: rendered?.render_path ?? null, sheets: rendered?.sheets ?? null });
      setConsent(false);
      setStage(rendered?.render_path
        ? 'ExcelをAIが読める形式に変換しました。内容を確認して構造化してください。'
        : '登録しました。内容を確認して構造化してください。');
      if (!(await onIngested(result.product))) setError('登録は完了しましたが、画面の再取得に失敗しました。再読み込みしてください。');
      await loadUploads(result.product);
    } catch (problem) {
      const message = (problem as Error).message;
      setError(message); setStage('');
      // The duplicate refusal names the path the file is already registered under,
      // and that path may belong to a different product than the one selected —
      // which is exactly the case where the list below would otherwise be empty
      // and the refusal would look like a dead end.
      const owner = /uploads\/([a-z0-9_]+)\//.exec(message);
      if (owner) { setDuplicateOwner(owner[1]); await loadUploads(owner[1]); }
    }
    finally { clearInterval(timer); setWorking(false); }
  }

  // Transcription is deliberately independent of structuring: it shows what the AI
  // read without creating any candidate, and the procedure stores the result so a
  // second press costs nothing. Shared by the button shown right after an upload
  // and by the list of documents already on the stage, so a document registered
  // in an earlier session can be previewed without re-uploading it.
  async function preview(path?: string) {
    const target = path ?? registered?.path;
    if (!target) return;
    setWorking(true); setError(''); setStage('AIで文字起こししています。数十秒かかります…');
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    try {
      const response = await fetch('/api/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SFS-Request': '1' },
        body: JSON.stringify({ path: target }), cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '文字起こし結果を確認できません。');
      const result = payload.result as { cached: boolean; elapsed_ms: number; source_path: string; mode: string; parse_error: string | null };
      setTranscript({ pages: payload.pages as TranscriptPage[], cached: result.cached,
        elapsed: result.elapsed_ms, mode: result.mode,
        source: result.source_path === target ? '' : result.source_path });
      setStage(result.cached ? '保存済みの文字起こしを表示しています。' : '文字起こししました。内容を確認してください。');
      if (result.parse_error) setError(`文字起こしの警告: ${result.parse_error}`);
    } catch (problem) { setError((problem as Error).message); setStage(''); }
    finally { clearInterval(timer); setWorking(false); }
  }

  async function structure() {
    if (!registered || !consent) return;
    await runStructure(registered.path, 'structure', registered.decided_before > 0, receiptOf);
  }

  // Shared by the button shown right after an upload and by the list of
  // documents already on the stage. `mode` picks STRUCTURE_UPLOAD or
  // RESTRUCTURE_UPLOAD; the procedure, not this code, decides what is allowed.
  async function runStructure(path: string, mode: 'structure' | 'restructure',
    consented: boolean, onResult?: (result: Record<string, unknown>) => void) {
    setWorking(true); setError('');
    setStage(mode === 'restructure'
      ? 'AIでやり直しています。数十秒かかります…'
      : 'AIで構造化しています。数十秒かかります…');
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    try {
      const response = await fetch('/api/structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SFS-Request': '1' },
        body: JSON.stringify({ path, consent: consented, mode }), cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '構造化結果を確認できません。');
      onResult?.(payload.result as Record<string, unknown>);
      setConsent(false); setRerunConsent(false); setSelected(null);
      // The wording differs by purpose: a structuring test cannot be confirmed at
      // all, so telling the tester to go and confirm would send them to a tab
      // where the values do not appear.
      setStage(testUpload
        ? (mode === 'restructure' ? 'やり直しました。抽出候補を確認してください。' : '構造化しました。抽出候補を確認してください。')
        : (mode === 'restructure' ? 'やり直しました。抽出候補を人が確認して確定してください。' : '構造化しました。抽出候補を人が確認して確定してください。'));
      // The product comes from the path so acting on a document that belongs to
      // another product still refreshes the right one.
      const target = /uploads\/([a-z0-9_]+)\//.exec(path)?.[1] ?? registered?.product ?? product;
      await loadUploads(target);
      await loadExtraction(path, target);
      if (!(await onIngested(target))) setError('処理は完了しましたが、画面の再取得に失敗しました。再読み込みしてください。');
    } catch (problem) { setError((problem as Error).message); setStage(''); }
    finally { clearInterval(timer); setWorking(false); }
  }

  // Only the post-upload flow shows the extraction receipt; the list re-reads
  // the document rows instead.
  function receiptOf(result: Record<string, unknown>) { setReceipt(result); }

  const reopening = (registered?.decided_before ?? impact?.n_decided ?? 0) > 0;
  // Read-only on purpose: a structuring test is judged by looking at the values,
  // and confirming one belongs in tabs 01 and 02 where the production views and
  // the decision history apply. Primary candidates are marked because that is
  // what those tabs would offer first.
  const extractionTable = extracted && <div className="extraction-preview">
    <small>抽出候補（{extracted.rows.length}件・確定はできません）</small>
    {extracted.rows.length === 0
      ? <p className="muted">この原本からの抽出候補はありません。</p>
      : <div className="batch-table"><table>
          <thead><tr><th>項目</th><th>抽出値</th><th>出典</th></tr></thead>
          <tbody>{extracted.rows.map((row, index) => <tr key={`${row.attr_key}-${index}`}>
            <td>{row.attr_label}{row.is_primary && <small>第一候補</small>}</td>
            <td>{row.raw_value ?? '—'}</td>
            <td>{row.source_label ?? '—'}</td>
          </tr>)}</tbody>
        </table></div>}
  </div>;
  return <section className="batch-panel upload-panel">
    <h2>{testUpload ? '構造化テスト' : '原本を追加して構造化'}</h2>
    <div className="batch-content">
      <p className="muted">{testUpload
        ? '受け取ったPDFまたはExcelをテストとして登録し、AIで項目を抽出します。テスト登録はマスターデータ管理と様式レビューの集計には入りません。既存の原本と確定済みの値は書き換えません。'
        : '受け取ったPDFまたはExcelをこの環境に登録し、AIで項目を抽出します。抽出結果は候補であり、人が確認するまで確定値になりません。既存の原本と確定済みの値は書き換えません。'}</p>
      <label className="control"><span>PDF・Excel（20MBまで）</span>
        <input type="file" accept="application/pdf,.pdf,.xls,.xlsx" disabled={locked}
          onChange={event => { setFile(event.target.files?.[0] ?? null); setConsent(false); setRegistered(null); setReceipt(null); setTranscript(null); setError(''); }} />
      </label>
      {file && <p className="muted">{file.name} / {(file.size / 1024 / 1024).toFixed(2)}MB</p>}
      <Select label="対象" value={mode} onChange={chooseMode} disabled={locked || !!registered}>
        <option value="new">新しい素材として追加</option>
        <option value="existing">既存商品の根拠として追加</option>
      </Select>
      {newProduct ? <>
        <TextInput label="商品キー（英小文字・数字・_）" value={slug} onChange={next => { setSlug(next); setConsent(false); }} />
        {!keyValid && <p className="error" role="alert">商品キーは英小文字・数字・_ のみです。</p>}
        <TextInput label="商品名" value={name} onChange={next => { setName(next); setConsent(false); }} />
        <TextInput label="仕入先（任意）" value={supplier} onChange={next => { setSupplier(next); setConsent(false); }} />
        <TextInput label="提出先（任意）" value={submitTo} onChange={next => { setSubmitTo(next); setConsent(false); }} />
        {testUpload && <p className="muted">構造化テストで追加した商品も、01 品目マスタと 02 提出フォームに未確定の状態で並びます。テスト文書から読み取った値は集計に入りません。</p>}
      </> : <>
        <Select label="商品" value={existing} onChange={chooseExisting} disabled={locked || !!registered}>
          {products.map(row => <option key={row.product_slug} value={row.product_slug}>{row.product_name}</option>)}
        </Select>
        {impact && <p className={impact.n_decided > 0 ? 'warning' : 'muted'}>
          {impact.n_decided > 0
            ? `この商品は確定済み・テスト状態が${impact.n_decided}件あります（確認済み${impact.n_confirmed}件）。根拠が増えると最大${impact.n_decided}件が要再確認に戻り、再度の確認が必要になります。`
            : 'この商品に確定済みの項目はありません。'}
        </p>}
      </>}
      <Select label="文書種別" value={docType} onChange={next => { setDocType(next); setConsent(false); }} disabled={locked || !!registered}>
        {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      {docType === 'form' && <p className="warning">様式は提出用の書式です。抽出候補は作られません。</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {error.includes('同じ内容の原本') && <p className="muted">
        この原本は既に{duplicateOwner ? `商品「${duplicateOwner}」に` : ''}登録されています。下の「アップロード済みの原本」から構造化、またはやり直してください。
      </p>}
      {stage && <p className="success" role="status">{stage}{working ? ` （${elapsed}秒）` : ''}</p>}
      {!registered ? <>
        <Check checked={consent} disabled={locked || !file || !keyValid || (newProduct && !name.trim())}
          onChange={setConsent}>この原本をこの環境に登録することを確認した</Check>
        <div className="action-row">
          <Button disabled={locked || !file || !consent || !keyValid || (newProduct && !name.trim())} onClick={upload}>
            <FilePlus2 size={16} />{working ? '処理中…' : '原本を登録'}
          </Button>
          {/* Shown disabled rather than hidden: the transcription needs a registered
              document, and a button that only appears later reads as a missing one. */}
          <Button variant="outline" disabled>
            <ScrollText size={16} />文字起こしをプレビュー
          </Button>
        </div>
        <small>文字起こしは登録後の原本に対して行います。先に「原本を登録」を実行してください。</small>
      </> : <>
        <div className="current-value"><small>登録済みの原本</small><p>{registered.original_filename}</p><small>{registered.path}</small></div>
        {registered.rendition && <p className="muted">
          ExcelはそのままAIに渡せないため、値だけをHTMLに変換しました（{registered.sheets ?? 0}シート）。以降の文字起こしと抽出はこの変換後の内容に対して行います。
        </p>}
        <div className="action-row">
          <Button variant="outline" disabled={locked} onClick={() => preview()}>
            <ScrollText size={16} />{working ? '処理中…' : '文字起こしをプレビュー'}
          </Button>
        </div>
        {transcript && <TranscriptView pages={transcript.pages} cached={transcript.cached}
          elapsed={transcript.elapsed} source={transcript.source} mode={transcript.mode} />}
        {!receipt ? <>
          {reopening && <p className="warning">構造化すると、この商品の確定済み最大{registered.decided_before}件が要再確認に戻ります。</p>}
          <Check checked={consent} disabled={locked} onChange={setConsent}>
            {reopening ? 'AIで構造化し、確定済みが要再確認に戻ることを確認した' : 'AIで構造化することを確認した'}
          </Check>
          <Button disabled={locked || !consent} onClick={structure}>
            <Sparkles size={16} />{working ? '構造化中…' : 'AIで構造化'}
          </Button>
        </> : <>
          <div className="batch-table"><table><thead><tr><th>判定種別</th><th>抽出候補</th><th>所要</th></tr></thead>
            <tbody><tr>
              <td>{String(receipt.doc_kind ?? '不明')}</td>
              <td>{String(receipt.candidates ?? 0)}件</td>
              <td>{Math.round(Number(receipt.elapsed_ms ?? 0) / 1000)}秒</td>
            </tr></tbody></table></div>
          {Number(receipt.candidates ?? 0) === 0 && (receipt.doc_kind === 'form'
            ? <p className="warning">AIはこの原本を「提出用の様式」と判定したため、抽出候補は作られていません。原料情報票などの提出様式はこの扱いになります。規格書・SDS・試験成績書を登録すると候補が作られます。</p>
            : <p className="warning">抽出候補はありません。文書種別と原本の内容を確認してください。</p>)}
          {['classify_error', 'extract_error', 'gap_error'].map(field => receipt[field]
            ? <p key={field} className="error" role="alert">{field}: {String(receipt[field])}</p> : null)}
          <p className="muted">{testUpload
            ? '転記結果は下の抽出候補で確認できます。テスト登録なので 01 マスターデータ管理には現れません。'
            : '01 マスターデータ管理のタブに切り替え、抽出候補を根拠原本と照合して確定してください。'}</p>
          {extractionTable}
          <Button variant="outline" disabled={locked} onClick={reset}>次の原本を追加</Button>
        </>}
      </>}
      {uploads.length > 0 && <div className="upload-history">
        <small>アップロード済みの原本{duplicateOwner ? `（商品「${duplicateOwner}」）` : ''}</small>
        <div className="batch-table"><table>
          <thead><tr><th>原本</th><th>種別</th><th>状態</th><th></th></tr></thead>
          <tbody>{uploads.map(row => {
            const structured = row.n_extract > 0 || row.n_gap > 0;
            // The document just registered already has its own consent and button in
            // the block above, so offering them again here put two identical
            // controls for one document on the screen at once.
            const inReceiptFlow = registered?.path === row.stage_path;
            return <tr key={row.stage_path}>
              <td>{row.original_filename}</td>
              <td>{row.doc_type}</td>
              <td>{structured ? `構造化済み（候補${row.n_candidates}件）` : '未構造化'}</td>
              <td className="row-actions">
                {/* Transcription is read-only and never touches candidates, so it
                    needs no confirmation step — unlike structuring, which opens
                    the consent block below. */}
                <Button variant="outline" disabled={locked} onClick={() => preview(row.stage_path)}>
                  <ScrollText size={16} />文字起こしをプレビュー
                </Button>
                {structured && <Button variant="outline" disabled={locked}
                  onClick={() => loadExtraction(row.stage_path, row.stage_path.split('/')[1])}>
                  抽出候補を見る
                </Button>}
                {inReceiptFlow
                  ? <small>上の手順で操作してください</small>
                  : <Button variant="outline" disabled={locked}
                      onClick={() => setSelected({ path: row.stage_path, mode: structured ? 'restructure' : 'structure' })}>
                      {structured ? 'AIでやり直す' : 'AIで構造化'}
                    </Button>}
              </td>
            </tr>;
          })}</tbody>
        </table></div>
        {/* Rendered here only when there is no registration receipt above, which
            already shows the transcript; otherwise the same panel would appear
            twice on one screen. */}
        {transcript && !registered && <TranscriptView pages={transcript.pages} cached={transcript.cached}
          elapsed={transcript.elapsed} source={transcript.source} mode={transcript.mode} />}
        {!receipt && extractionTable}
        {selected && selected.path !== registered?.path && <>
          {/* The wording differs because the two operations lose different
              things: structuring adds evidence, re-structuring discards the
              previous extraction first. */}
          {selected.mode === 'restructure'
            ? <p className="warning">
                前回の抽出結果を破棄して作り直します。人が確定した値・履歴・過去の出力は保持しますが、
                AIの出力が前回と変われば確定済み最大{impact?.n_decided ?? 0}件が要再確認に戻ります。
              </p>
            : reopening && <p className="warning">構造化すると、この商品の確定済み最大{impact?.n_decided ?? 0}件が要再確認に戻ります。</p>}
          <Check checked={rerunConsent} disabled={locked} onChange={setRerunConsent}>
            {selected.mode === 'restructure'
              ? '前回の抽出結果を破棄してやり直すことを確認した'
              : 'AIで構造化することを確認した'}
          </Check>
          <div className="action-row">
            <Button disabled={locked || !rerunConsent}
              onClick={() => runStructure(selected.path, selected.mode, true)}>
              <Sparkles size={16} />{working ? '処理中…' : selected.mode === 'restructure' ? 'AIでやり直す' : 'AIで構造化'}
            </Button>
            <Button variant="outline" disabled={locked} onClick={() => setSelected(null)}>やめる</Button>
          </div>
        </>}
      </div>}
    </div>
  </section>;
}
