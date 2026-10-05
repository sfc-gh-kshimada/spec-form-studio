"use client";
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Layers2, LogOut, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Sun, UserRound } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from './theme-provider';
import { Check, Select, Status, BatchPanel } from './review-controls';
import { MasterReview } from './master-review';
import { FormReview } from './form-review';
import { UploadPanel } from './upload-panel';
import { useData, type Submit } from '@/lib/client';
import { affectedQuery, blockingRefresh } from '@/lib/query-refresh';
import { featured, type Document, type Field, type History, type Issue, type Maker, type Master, type Product } from '@/lib/model';
import { batchRemainingMessage, batchResultMessage } from '@/lib/batch-feedback';

export function ReviewApp() {
  const client = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const catalog = useData<{ products: Product[]; makers: Maker[] }>('products');
  const session = useData<{ user_name: string; role_name: string }>('session');
  const [sampleOnly, setSampleOnly] = useState(true);
  // Read after mount rather than in the initializer so the server render and the
  // first client render agree; the stored choice applies one frame later.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => { if (localStorage.getItem('sfs.sidebar') === 'closed') setSidebarOpen(false); }, []);
  const toggleSidebar = () => setSidebarOpen(open => { localStorage.setItem('sfs.sidebar', open ? 'closed' : 'open'); return !open; });
  const [supplier, setSupplier] = useState('');
  const [maker, setMaker] = useState('');
  // Empty means "the first product in the list"; see `product` below.
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('master');
  const [test, setTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const sending = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [pdfEpoch, setPdfEpoch] = useState(0);
  const identity = session.data ? JSON.stringify(session.data) : '';
  const previousIdentity = useRef('');
  useEffect(() => {
    if (previousIdentity.current && identity && identity !== previousIdentity.current) {
      client.removeQueries({ predicate: entry => entry.queryKey[0] === 'data' && entry.queryKey[1] !== 'session' });
      window.location.reload();
    }
    if (identity) previousIdentity.current = identity;
  }, [client, identity]);
  const [showHistory, setShowHistory] = useState(false);
  // Documents added during a meeting must stay reachable even while the sample
  // filter is on, otherwise a brand-new material disappears from the list.
  const [ingested, setIngested] = useState<string[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const all = catalog.data?.products ?? [];
  const scoped = all.filter(product => !sampleOnly || !featured.length || featured.includes(product.product_slug) || ingested.includes(product.product_slug));
  const products = scoped.filter(product => (!supplier || product.supplier_company === supplier) &&
    (!maker || catalog.data?.makers.some(row => row.product_slug === product.product_slug && row.maker_name === maker)));
  const product = products.find(row => row.product_slug === selected) ?? products[0];
  const slug = product?.product_slug ?? '';
  const masters = useData<Master[]>('master', { product: slug }, !!slug);
  const documents = useData<Document[]>('documents', { product: slug }, !!slug);
  const issues = useData<Issue[]>('issues', { product: slug }, !!slug);
  const history = useData<History[]>('history', { product: slug }, !!slug && showHistory);
  const rows = masters.data ?? [];
  const errors = [catalog.error, session.error, masters.error, documents.error, issues.error, history.error].filter(Boolean);
  const mutationDisabled = busy || refreshing || refreshFailed || ingesting || errors.length > 0 || masters.isFetching || documents.isFetching;
  const submit: Submit = async (operation, body) => {
    if (sending.current || mutationDisabled) throw new Error('再読み込みが完了するまで操作できません。');
    sending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/decision/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SFS-Request': '1' }, body: JSON.stringify(body), cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '保存結果を確認できません。');
      setBusy(false);
      const batchMessage = operation === 'batch' ? ` ${batchResultMessage(payload.result)}` : '';
      setNotice(operation === 'export' ? '生成時点のレビュー票を記録しました。' : `保存済み。確認状態を更新しています。${batchMessage}`);
      if (operation !== 'export') {
        setEpoch(current => current + 1);
        setRefreshing(true);
        try {
          await client.invalidateQueries({ predicate: entry => affectedQuery(entry.queryKey, operation, body), refetchType: 'none' });
          await client.refetchQueries({ predicate: entry => blockingRefresh(entry.queryKey, operation, body), type: 'active' }, { throwOnError: true });
          void client.refetchQueries({ predicate: entry => affectedQuery(entry.queryKey, operation, body) && entry.queryKey[1] === 'history', type: 'active' });
          let remainingMessage = '';
          const target = body as { product?: string; scope?: string; action?: string };
          if (operation === 'batch' && target.action !== 'reset') {
            const queryKey = target.scope === 'master'
              ? ['data', 'master', { product: target.product }]
              : ['data', 'fields', { product: target.product, form: target.scope }];
            remainingMessage = batchRemainingMessage(client.getQueryData<(Master | Field)[]>(queryKey));
          }
          setNotice(`保存済み。確認状態を更新しました。${batchMessage}${remainingMessage}`);
        } catch {
          setRefreshFailed(true);
          setError('保存は完了しましたが、画面の再取得に失敗しました。再送せず、再読み込みしてください。');
        } finally { setRefreshing(false); }
      }
      return payload.result;
    } catch (problem) {
      setError((problem as Error).message || '保存結果を確認できません。再読み込み後に履歴を確認してください。');
      throw problem;
    } finally { sending.current = false; setBusy(false); }
  };
  async function refresh() {
    if (sending.current) return;
    setRefreshing(true); setNotice(''); setError(''); setEpoch(current => current + 1); setPdfEpoch(current => current + 1);
    try { await client.invalidateQueries({ queryKey: ['data'] }, { throwOnError: true }); setRefreshFailed(false); }
    catch { setRefreshFailed(true); setError('再読み込みに失敗しました。確認操作は停止しています。'); }
    finally { setRefreshing(false); }
  }
  // A newly ingested document changes the candidate set, so the affected product
  // is re-read authoritatively before any further confirmation is allowed.
  async function ingestDone(target: string) {
    setIngesting(true); setNotice(''); setError(''); setEpoch(current => current + 1); setPdfEpoch(current => current + 1);
    setIngested(current => current.includes(target) ? current : [...current, target]);
    setSelected(target);
    try {
      // The product's cached responses are dropped rather than refetched: the
      // registration step already cached a pre-structuring answer for the same
      // key, and a refetch can resolve before the new observer subscribes.
      client.removeQueries({ predicate: entry => entry.queryKey[0] === 'data'
        && (entry.queryKey[2] as { product?: string } | undefined)?.product === target });
      await client.invalidateQueries({ predicate: entry => entry.queryKey[0] === 'data' && entry.queryKey[1] !== 'session', refetchType: 'none' });
      await client.refetchQueries({ type: 'active' }, { throwOnError: true });
      setRefreshFailed(false);
      return true;
    } catch { setRefreshFailed(true); return false; }
    finally { setIngesting(false); }
  }
  const controlsDisabled = busy || refreshing || catalog.isLoading;
  // The proxy's logout path answers with JSON instead of redirecting, so the click
  // requests it and then navigates. The destination is this app's own root: with the
  // session gone the ingress proxy answers that request with its own
  // /oauth/authorize?...&interface=SPCS redirect, whose state carries this host and
  // path, so signing in again lands back here rather than in Snowsight. That URL
  // cannot be built by hand — its client_id, csrfToken and state are minted per
  // login attempt — and it does not need to be. If the fetch fails, the <a> href
  // still ends the session; the reviewer just sees the logout response.
  async function logout(event: { preventDefault: () => void }) {
    event.preventDefault();
    try { await fetch('/sfc-endpoint/logout', { cache: 'no-store', credentials: 'same-origin' }); }
    catch { window.location.href = '/sfc-endpoint/logout'; return; }
    window.location.href = '/';
  }
  return <div className="app-shell">
    <header className="app-header"><div className="header-start"><Button variant="ghost" size="icon" aria-label={sidebarOpen ? '対象の選択を閉じる' : '対象の選択を開く'} aria-expanded={sidebarOpen} aria-controls="sfs-sidebar" title={sidebarOpen ? '対象の選択を閉じる' : '対象の選択を開く'} onClick={toggleSidebar}>{sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}</Button><div className="brand"><FileCheck2 size={25} /><div><h1>原料情報マスター</h1><small>Spec Form Studio</small></div></div></div><div className="header-actions"><span className="identity" title="接続中のユーザーとロール"><UserRound size={15} aria-hidden="true" />{session.data?.user_name ?? '接続確認中'}<small>{session.data?.role_name}</small></span><Button variant="ghost" size="icon" aria-label="表示テーマを切替" title={resolvedTheme === 'dark' ? 'ライト表示に切替' : 'ダーク表示（暗い画面）に切替'} onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>{resolvedTheme === 'dark' ? <Sun /> : <Moon />}</Button><Button variant="ghost" size="icon" aria-label="再読み込み" title="最新のデータを再読み込み" disabled={busy} onClick={refresh}><RefreshCw /></Button>{/* Handled by the Snowflake ingress proxy, not by this app: requesting
          /sfc-endpoint/logout ends the browser's Snowflake session, so the next
          request to the public endpoint has to authenticate again. Deliberately not
          a Next.js route or a <Link> — either one would swallow the path before it
          reached the proxy. The local server has no proxy in front of it, so the
          path 404s there; the deployed app is the only place it means anything. */}
      <Button variant="ghost" size="icon" aria-label="ログアウト" title="ログアウト（Snowflakeのセッションを終了）" asChild><a href="/sfc-endpoint/logout" onClick={logout}><LogOut /></a></Button></div></header>
    <div className={sidebarOpen ? 'app-body' : 'app-body sidebar-collapsed'}><aside id="sfs-sidebar" className="sidebar" hidden={!sidebarOpen}><h2>対象の選択</h2><fieldset disabled={controlsDisabled}>
      <Check checked={sampleOnly} onChange={next => { setSampleOnly(next); setSupplier(''); setMaker(''); }}>出力サンプルが揃う3商品</Check>
      <Select label="仕入先" value={supplier} onChange={next => { setSupplier(next); setMaker(''); }}><option value="">すべて</option>{[...new Set(scoped.map(row => row.supplier_company).filter(Boolean))].sort().map(name => <option key={name!} value={name!}>{name}</option>)}</Select>
      <Select label="メーカー（抽出候補）" value={maker} onChange={setMaker}><option value="">すべて</option>{[...new Set(catalog.data?.makers.filter(row => scoped.some(product => product.product_slug === row.product_slug && (!supplier || product.supplier_company === supplier))).map(row => row.maker_name))].sort().map(name => <option key={name} value={name}>{name}</option>)}</Select>
      <Select label="商品" value={slug} onChange={next => { setSelected(next); setNotice(''); setError(''); }}>{products.map(row => <option key={row.product_slug} value={row.product_slug}>{row.product_name}</option>)}</Select>
    </fieldset><div className="sidebar-divider" /><Check checked={test} disabled={busy} onChange={setTest}>テスト用一括操作</Check><p className="muted sidebar-foot">受領資料に基づく検証環境<br />2026年9月17日 訪問用</p></aside>
    <main className="workspace">
      {catalog.isLoading && <p className="empty-state" role="status">商品を取得中…</p>}
      {errors.map((problem, index) => <p key={index} className="error" role="alert">{problem?.message}</p>)}
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
      {!catalog.isLoading && !product && <p className="empty-state">対象の商品がありません。絞り込み条件を変更してください。</p>}
      {product && <><div className="product-heading"><div><p className="eyebrow">{product.supplier_company || '仕入先未登録'}</p><h2>{product.product_name}</h2></div><div className="source-count"><Layers2 size={16} /><span>根拠文書 {product.n_input_docs} / 提出済み {product.n_output_docs}</span></div></div>
      <p className="muted">マスターの確認状態</p>
      <div className="metrics">{(['confirmed', 'review', 'changed', 'missing'] as const).map(state => <div key={state}><Status status={state} /><strong>{rows.filter(row => row.status === state).length}</strong></div>)}<div className="test-count"><span>テスト確定 <b>{rows.filter(row => row.status === 'test_confirmed').length}</b></span><span>入力省略 <b>{rows.filter(row => row.status === 'test_skipped').length}</b></span></div></div>
      {rows.some(row => ['test_confirmed', 'test_skipped'].includes(row.decision_state)) && <p className="warning">テスト状態を含みます。通常の確認済み件数・通常出力には含めません。</p>}
      {!!issues.data?.length && <details className="issues"><summary>文書の処理状況: {issues.data.length}件を要確認</summary>{issues.data.map((issue, index) => <p key={index}><code>{issue.stage_path}</code> / {issue.step}<br />{issue.err}</p>)}</details>}
      {test && <BatchPanel key={`${slug}_reset_${epoch}`} product={slug} scope="all" submit={submit} busy={mutationDisabled} reset />}
      <nav className="tabs" aria-label="レビュー段階"><button role="tab" aria-selected={tab === 'master'} disabled={busy || refreshing} onClick={() => setTab('master')}><span>01</span>マスターデータ管理</button><button role="tab" aria-selected={tab === 'form'} disabled={busy || refreshing} onClick={() => setTab('form')}><span>02</span>様式レビュー&出力</button><button role="tab" aria-selected={tab === 'upload'} disabled={busy || refreshing} onClick={() => setTab('upload')}><span>03</span>構造化テスト</button></nav>
      {tab === 'master' && <MasterReview key={`${slug}_${identity}`} product={slug} rows={rows} documents={documents.data ?? []} {...{ test, submit, epoch, pdfEpoch }} busy={mutationDisabled} />}
      {tab === 'form' && <FormReview key={`${slug}_${identity}`} product={slug} name={product.product_name} masters={rows} documents={documents.data ?? []} {...{ test, submit, epoch, pdfEpoch }} busy={mutationDisabled} />}
      {/* Hidden rather than unmounted: the panel holds the registration receipt,
          the transcript and the extraction log in local state, and a user who
          switches to 01 to look at the candidates would otherwise lose all of it
          on the way back. */}
      <div hidden={tab !== 'upload'}>
        <UploadPanel products={products} current={slug} busy={mutationDisabled} onIngested={ingestDone} purpose="test" />
      </div>
      <details className="history" open={showHistory} onToggle={event => setShowHistory(event.currentTarget.open)}><summary>変更履歴</summary>{history.isLoading ? <p role="status">履歴を取得中…</p> : <div className="batch-table"><table><thead><tr><th>時刻 / 実行者</th><th>対象</th><th>操作</th><th>変更前</th><th>変更後</th></tr></thead><tbody>{history.data?.map((row, index) => <tr key={index}><td>{new Date(row.acted_at).toLocaleString('ja-JP')}<small>{row.actor}</small></td><td>{row.scope_id} / {row.field_key}</td><td>{row.action}</td><td>{row.old_value}</td><td>{row.new_value}</td></tr>)}</tbody></table>{!history.data?.length && <p>履歴はありません。</p>}</div>}</details>
      </>}
    </main></div>
  </div>;
}