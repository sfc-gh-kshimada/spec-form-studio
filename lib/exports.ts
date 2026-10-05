import { displayValue, type ExportSnapshot, type State } from './model';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const htmlStatus = (status: State, test: boolean) => status === 'test_skipped' ? 'テスト入力省略・値未提供' :
  status === 'confirmed' ? '確認済み' : status === 'test_confirmed' && test ? 'テスト確定・内容未確認' : '未確認・出力対象外';

export const safeCell = (value: unknown) => {
  const text = String(value ?? '');
  return /^[\s]*[=+\-@\t\r\n]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
};

export function exportCsv(snapshot: ExportSnapshot) {
  const test = snapshot.kind === 'test_only';
  const rows = [['区分', '項目', test ? 'テスト値・正式提出不可' : '確認済み値', '状態', '出所', '確認者'],
    ...snapshot.rows.map(row => [row.section, row.label, displayValue(row, test), row.status === 'test_skipped' ? 'テスト入力省略・値未提供' : row.status, row.source_note, row.decided_by])];
  return '\uFEFF' + rows.map(row => row.map(value => `"${safeCell(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
}

// `sourceTable` is passed in rather than built here: this module runs in the
// browser as well as on the server, so it cannot import the server-only module
// that resolves the database and schema. Callers that know the qualified name
// supply it; the fallback names the table without claiming a database.
export function exportHtml(snapshot: ExportSnapshot, product: string, form: string, sourceTable = 'EXPORT_HISTORY') {
  const test = snapshot.kind === 'test_only';
  const notice = test ? 'テスト専用・内容未確認・正式提出不可。値未提供の欄は実値ではありません。' : '転記用レビュー票・正式提出不可。確認済みの値だけを掲載します。';
  const metadata = JSON.stringify({ kind: snapshot.kind, exportId: snapshot.export_id, intent: notice,
    dataSources: [{ type: 'table', name: sourceTable }], sections: [{ id: 'review', title: form }] }).replaceAll('<', '\\u003c');
  const body = snapshot.rows.map(row => '<tr>' + [row.section, row.label, displayValue(row, test), htmlStatus(row.status, test), row.source_note]
    .map(value => `<td>${escape(value)}</td>`).join('') + '</tr>').join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="snowflake-source" content="cortex-agent-authored"><title>${escape(product)} / レビュー票</title>
<script type="application/json" id="snowflake-report-metadata">${metadata}</script>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;color:light-dark(#17324d,#e9eef6);background:light-dark(#fff,#152136)}h1{font-size:22px}.notice{border-left:4px solid #9a5b13;padding:12px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #8b9ba9;padding:8px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}@media print{tr{break-inside:avoid}}</style>
</head><body><h1 id="review">${escape(product)} / ${escape(form)}</h1><p class="notice">${escape(notice)}</p><p>出力ID: ${escape(snapshot.export_id)}</p>
<div class="table-wrap"><table><thead><tr><th>区分</th><th>項目</th><th>${test ? 'テスト値' : '確認済み値'}</th><th>状態</th><th>出所</th></tr></thead><tbody>${body}</tbody></table></div></body></html>`;
}