"use client";
import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from './ui/button';
import { Check, Select, TextInput } from './review-controls';
import type { Submit } from '@/lib/client';
import type { Document, Field, Master } from '@/lib/model';

// Bulk confirmation for form fields. Needs no extra request: the field list, the
// confirmed master values and the originals are already on screen.
//
// Per row the reviewer picks one of three things: transcribe a confirmed master
// value, type the value they read in the original, or leave the field out. Typed
// rows carry the same evidence a one-by-one confirm records — the value plus the
// document and version it was read from — so the shared document selector below is
// part of the record, not a convenience.
export function BulkFormPanel({ product, form, fields, masters, documents, busy, submit, epoch }: {
  product: string; form: string; fields: Field[]; masters: Master[]; documents: Document[];
  busy: boolean; submit: Submit; epoch: number }) {
  const confirmed = masters.filter(row => row.status === 'confirmed' && row.value);
  const pending = fields.filter(row => !['confirmed', 'test_confirmed', 'test_skipped'].includes(row.status));
  const sources = documents.filter(doc => doc.is_current && doc.stage_path.endsWith('.pdf'));
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const sourceDoc = sources.find(doc => doc.stage_path === source)
    ?? sources.find(doc => doc.doc_role === 'input') ?? sources[0];
  // The suggested attribute is the default only when it is actually confirmed;
  // otherwise the row starts unset and is left out until someone chooses.
  const choiceFor = (row: Field) => chosen[row.field_key]
    ?? (confirmed.some(master => master.attr_key === row.suggested_attr) ? row.suggested_attr ?? '' : '');
  const manual = '__manual__';
  const ready = pending.filter(row => {
    const choice = choiceFor(row);
    if (choice === manual) return !!typed[row.field_key]?.trim() && !!sourceDoc;
    return !!choice;
  });
  async function apply() {
    if (!ready.length || !consent) return;
    try {
      await submit('bulk_form', { product, form, consent,
        note: note.trim() || '一括確定（確定マスターから転記・原本から補完）',
        items: ready.map(row => {
          const choice = choiceFor(row);
          const base = { field_key: row.field_key, revision: row.revision,
            template: row.current_template_signature };
          if (choice === manual) {
            return { ...base, attr_key: null, master_revision: null,
              value: typed[row.field_key].trim(),
              source_path: sourceDoc?.stage_path ?? null, source_version: sourceDoc?.version_key ?? null };
          }
          const master = confirmed.find(item => item.attr_key === choice);
          return { ...base, attr_key: master?.attr_key ?? null, master_revision: master?.revision ?? null,
            value: null, source_path: null, source_version: null };
        }) });
      setConsent(false); setNote(''); setChosen({}); setTyped({});
    } catch { setConsent(false); }
  }
  if (!pending.length) return null;
  const manualCount = pending.filter(row => choiceFor(row) === manual).length;
  return <details className="batch-panel">
    <summary>未確認の欄をまとめて確定</summary>
    <div className="batch-content">
      <p className="muted">
        欄ごとに、01 で確定したマスター値を転記するか、原本を見て手入力するかを選べます。
        「転記しない」の欄は対象外です。
        1件でも様式定義・マスター・根拠文書が変わっていた場合は、何も確定せずに中止します。
      </p>
      <p role="status">対象 <strong>{ready.length}件</strong>（うち手入力 {manualCount}件） / 未確認の欄 {pending.length}件</p>
      {!confirmed.length && <p className="warning">確定済みのマスター値がありません。転記する場合は先に 01 マスターデータ管理で値を確定してください。</p>}
      {manualCount > 0 && (sourceDoc
        ? <Select label="手入力した値の根拠文書（手入力の欄に共通）" value={sourceDoc.stage_path} disabled={busy}
            onChange={next => { setSource(next); setConsent(false); }}>
            {sources.map(doc => <option key={doc.stage_path} value={doc.stage_path}>
              {doc.doc_role === 'output' ? '過去の提出済み / ' : ''}{doc.original_filename}</option>)}
          </Select>
        : <p className="warning">根拠となる原本がありません。手入力の欄は確定できません。</p>)}
      <div className="batch-table"><table>
        <thead><tr><th>確定</th><th>欄</th><th>欄に入れる値</th></tr></thead>
        <tbody>{pending.map(row => {
          const choice = choiceFor(row);
          const master = confirmed.find(item => item.attr_key === choice);
          const included = ready.some(item => item.field_key === row.field_key);
          return <tr key={row.field_key}>
            <td className="row-check"><Check checked={included} disabled={busy || !choice}
              onChange={next => { setChosen(current => ({ ...current, [row.field_key]: next ? (master?.attr_key ?? manual) : '' })); setConsent(false); }}>
              {row.field_label}を確定する</Check></td>
            <td><small>{row.section}{row.required ? ' / 必須' : ''}</small>{row.field_label}</td>
            <td><Select label={`${row.field_label}に入れる値`} value={choice} disabled={busy}
                onChange={next => { setChosen(current => ({ ...current, [row.field_key]: next })); setConsent(false); }}>
                <option value="">転記しない</option>
                <option value={manual}>原本を見て手入力</option>
                {confirmed.map(item => <option key={item.attr_key} value={item.attr_key}>{item.attr_label}: {item.value}</option>)}
              </Select>
              {choice === manual
                ? <TextInput label={`${row.field_label}の値`} value={typed[row.field_key] ?? ''} multiline
                    onChange={next => { setTyped(current => ({ ...current, [row.field_key]: next })); setConsent(false); }} />
                : master && <small>{master.value}</small>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <TextInput label="欄の意味・単位・確認箇所（任意）" value={note} multiline
        onChange={next => { setNote(next); setConsent(false); }} />
      {!note.trim() && <p className="muted">未入力のまま確定すると「一括確定（確定マスターから転記・原本から補完）」として記録されます。</p>}
      <Check checked={consent} disabled={busy || !ready.length} onChange={setConsent}>
        一覧の値と適用条件を確認し、{ready.length}件を確定することを確認した
      </Check>
      <Button onClick={apply} disabled={busy || !consent || !ready.length} key={epoch}>
        <CheckCheck size={16} />{busy ? '確定中…' : `${ready.length}件を一括確定`}
      </Button>
    </div>
  </details>;
}
