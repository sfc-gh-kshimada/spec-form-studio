export type State = 'pending' | 'review' | 'missing' | 'confirmed' | 'test_confirmed' | 'test_skipped' | 'rejected' | 'changed';
export const labels: Record<State, string> = { pending: '未確認', review: '要確認', missing: '候補なし', confirmed: '確認済み', test_confirmed: 'テスト確定', test_skipped: '入力省略', rejected: '却下', changed: '要再確認' };
export const skipLabel = 'テスト用・値未提供';
// Seal and signature boxes are printed empty and stamped by hand afterwards. The
// pattern is used both to refuse drawing into such a box and to explain why a
// submission is blocked until someone records the rule for it.
export const signatureFieldPattern = /押印|署名|印影|印$|印（/;
// Products shown when the sidebar's sample filter is on. Empty shows every product.
export const featured = ['sample_emulsifier'];
export interface Product { product_slug: string; product_name: string; supplier_company: string | null; n_input_docs: number; n_output_docs: number; n_attrs: number; n_confirmed: number }
export interface Maker { product_slug: string; maker_name: string }
export interface Master { attr_key: string; attr_label: string; section: string; display_order: number; value: string | null; status: State; decision_state: State; revision: number; current_signature: string; n_candidates: number; n_values: number; n_documents: number; source_note: string | null; source_path: string | null; candidate_id: string | null }
export interface Candidate { candidate_id: string; raw_value: string; source_path: string | null; source_label: string; source_kind: string; version_key: string; review_note: string | null }
export interface Document { stage_path: string; product_slug: string; original_filename: string; doc_role: string; doc_type: string; is_current: boolean; version_key: string; size_bytes: number; customer_key: string | null }
export interface Form { form_id: string; customer: string; form_name: string; n_fields: number; is_designated: boolean }
export interface Field { field_key: string; field_label: string; section: string; value: string | null; output_value: string | null; status: State; revision: number; selected_attr: string | null; suggested_attr: string | null; required: boolean; guidance: string | null; current_template_signature: string }
export interface BatchItem { scope_id: string; field_key: string; label: string; revision: number; signature: string; candidate_id: string | null; value: string | null; target_state: State; previous_state: State; source_label: string | null }
export interface ExportRow { section?: string; field_key: string; label: string; value: string | null; status: State; source_note?: string | null; decided_by?: string | null; template_signature?: string }
export interface ExportSnapshot { export_id: string; kind: 'review_only' | 'test_only' | 'submission'; rows: ExportRow[]; layout?: { id: string; version: string; hash: string }; issues?: string[]; approval_id?: string | null }
export interface Issue { stage_path: string; step: string; err: string }
export interface History { acted_at: string; scope_id: string; field_key: string; action: string; old_value: string | null; new_value: string | null; actor: string }
export function displayValue(row: { value: string | null; status: State }, test = false): string {
  if (test && row.status === 'test_skipped') return skipLabel;
  if (row.status === 'confirmed' || (test && row.status === 'test_confirmed')) return row.value ?? '';
  return '';
}