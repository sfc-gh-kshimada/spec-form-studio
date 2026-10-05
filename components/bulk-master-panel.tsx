"use client";
import { useState } from 'react';
import { CheckCheck, ClipboardList } from 'lucide-react';
import { Button } from './ui/button';
import { Check, Select, TextInput } from './review-controls';
import { readData, type Submit } from '@/lib/client';

// One row per attribute awaiting review, with every candidate for it. The value
// is chosen per row rather than assumed: the primary flag is not unique, so a
// bulk confirm that silently took "the first one" would hide exactly the cases a
// reviewer needs to look at — two spellings of a display name, two standards.
//
// Per row the reviewer picks one of three things: confirm one of the extracted
// candidates, type the value themselves when no candidate carries it, or leave the
// attribute out. A typed row needs no document, the same as the one-by-one
// 手入力で補完 　— the reviewer is stating the value rather than pointing at where it
// was read — and the procedure records it with source_kind 'manual' either way.
type BulkCandidate = { attr_key: string; attr_label: string; section: string;
  revision: number; current_signature: string | null; status: string; n_values: number;
  candidate_id: string; raw_value: string; source_label: string; is_primary: boolean };
type Group = { attr_key: string; attr_label: string; section: string; revision: number;
  signature: string | null; status: string; n_values: number; candidates: BulkCandidate[] };

function group(rows: BulkCandidate[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const existing = groups.get(row.attr_key);
    if (existing) { existing.candidates.push(row); continue; }
    groups.set(row.attr_key, { attr_key: row.attr_key, attr_label: row.attr_label, section: row.section,
      revision: row.revision, signature: row.current_signature, status: row.status,
      n_values: row.n_values, candidates: [row] });
  }
  return [...groups.values()];
}

export function BulkMasterPanel({ product, busy, submit, epoch }: {
  product: string; busy: boolean; submit: Submit; epoch: number }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, true>>({});
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const manual = '__manual__';
  const included = (groups ?? []).filter(row => !excluded[row.attr_key]);
  const choiceFor = (row: Group) => chosen[row.attr_key] ?? row.candidates[0].candidate_id;
  // A row set to 手入力 with nothing typed yet is not an error, it is unfinished, so
  // it drops out of the request instead of blocking the whole batch.
  const ready = included.filter(row => choiceFor(row) !== manual || !!typed[row.attr_key]?.trim());
  const manualCount = ready.filter(row => choiceFor(row) === manual).length;
  // Reloaded rather than kept across a confirm: the revisions and signatures in
  // the list are what the procedure checks, so a stale list can only be refused.
  async function load() {
    setLoading(true); setError(''); setConsent(false); setGroups(null); setExcluded({}); setTyped({});
    try {
      const rows = await readData<BulkCandidate[]>('bulk_master', { product });
      const loaded = group(rows);
      setGroups(loaded);
      setChosen(Object.fromEntries(loaded.map(row => [row.attr_key, row.candidates[0].candidate_id])));
    } catch (problem) { setError((problem as Error).message); }
    finally { setLoading(false); }
  }
  async function apply() {
    if (!ready.length || !consent) return;
    try {
      await submit('bulk_master', { product, consent,
        note: note.trim() || (manualCount
          ? '一括確定（候補を一覧で確認・一部は手入力）'
          : '一括確定（候補を一覧で確認）'),
        items: ready.map(row => {
          const choice = choiceFor(row);
          const base = { attr_key: row.attr_key, revision: row.revision, signature: row.signature };
          return choice === manual
            ? { ...base, candidate_id: null, value: typed[row.attr_key].trim() }
            : { ...base, candidate_id: choice, value: null };
        }) });
      setGroups(null); setConsent(false); setNote(''); setTyped({});
    } catch { setConsent(false); }
  }
  return <details className="batch-panel">
    <summary>要確認の項目をまとめて確定</summary>
    <div className="batch-content">
      <p className="muted">
        抽出候補を一覧で確認し、選んだ値を一度に確定します。候補が複数ある項目は行ごとに選び直せます。
        適した候補がない項目は「手入力する」を選んで値を直接入力できます。
        1件でも他の操作や再抽出で変わっていた場合は、何も確定せずに中止します。
      </p>
      <Button variant="outline" disabled={loading || busy} onClick={load}>
        <ClipboardList size={16} />{loading ? '取得中…' : '一括確定の対象を表示'}
      </Button>
      {error && <p role="alert" className="error">{error}</p>}
      {groups && !groups.length && <p role="status">要確認の項目はありません。</p>}
      {groups && !!groups.length && <>
        <p role="status">対象 <strong>{ready.length}件</strong>（うち手入力 {manualCount}件） / 一覧 {groups.length}件（取得時点）</p>
        <div className="batch-table"><table>
          <thead><tr><th>確定</th><th>項目</th><th>確定する値</th><th>出所</th></tr></thead>
          <tbody>{groups.map(row => {
            const choice = choiceFor(row);
            const selected = row.candidates.find(item => item.candidate_id === choice);
            return <tr key={row.attr_key}>
              <td className="row-check"><Check checked={!excluded[row.attr_key]} disabled={busy}
                onChange={next => { setExcluded(current => {
                  const updated = { ...current };
                  if (next) delete updated[row.attr_key]; else updated[row.attr_key] = true;
                  return updated;
                }); setConsent(false); }}>{row.attr_label}を確定する</Check></td>
              <td><small>{row.section}</small>{row.attr_label}
                {row.status === 'changed' && <small>要再確認</small>}</td>
              {/* Rendered even when there is a single candidate: 手入力 has to be
                  reachable on every row, and one control for the whole column is
                  easier to read than a value on some rows and a list on others. */}
              <td><Select label={`${row.attr_label}に入れる値（候補${row.candidates.length}件）`} value={choice} disabled={busy}
                    onChange={next => { setChosen(current => ({ ...current, [row.attr_key]: next })); setConsent(false); }}>
                    <option value={manual}>手入力する</option>
                    {row.candidates.map(item => <option key={item.candidate_id} value={item.candidate_id}>{item.raw_value}（{item.source_label}）</option>)}
                  </Select>
                {choice === manual && <TextInput label={`${row.attr_label}の確認した値`} value={typed[row.attr_key] ?? ''} multiline
                  onChange={next => { setTyped(current => ({ ...current, [row.attr_key]: next })); setConsent(false); }} />}</td>
              <td>{choice === manual
                ? <><small>手入力</small><small>担当者による確認として記録</small></>
                : <><small>{selected?.source_label}</small>
                  {row.candidates.length > 1 && <small>候補{row.candidates.length}件から選択</small>}</>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <TextInput label="出所・確認した箇所（任意）" value={note} multiline
          onChange={next => { setNote(next); setConsent(false); }} />
        {!note.trim() && <p className="muted">未入力のまま確定すると「{manualCount
          ? '一括確定（候補を一覧で確認・一部は手入力）'
          : '一括確定（候補を一覧で確認）'}」として記録されます。</p>}
        {included.length > ready.length && <p className="warning">手入力の値が未入力の{included.length - ready.length}件は対象外です。</p>}
        <Check checked={consent} disabled={busy || !ready.length} onChange={setConsent}>
          一覧の値と出所を確認し、{ready.length}件を確定することを確認した
        </Check>
        <Button onClick={apply} disabled={busy || !consent || !ready.length} key={epoch}>
          <CheckCheck size={16} />{busy ? '確定中…' : `${ready.length}件を一括確定`}
        </Button>
      </>}
    </div>
  </details>;
}
