import { z } from 'zod';
import { database, prefix, query, requireIdentity, schema } from '@/lib/db';
import { key, documentPath } from '@/lib/validation';
import { failure, json } from '@/lib/http';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
// `${product}|${scope}` -> schema change mark at which the skips view was empty.
// Per server process; a restart or a new deploy simply reads the view once more.
const emptyBatch = new Map<string, string>();
export async function GET(request: Request) {
  return timedRequest(async () => {
  try {
    await requireIdentity();
    const search = new URL(request.url).searchParams;
    const resource = z.enum(['products', 'session', 'master', 'candidates', 'documents', 'forms', 'fields', 'issues', 'history', 'references', 'batch', 'upload_impact', 'uploads', 'transcript', 'extraction', 'bulk_master', 'blockers', 'coverage']).parse(search.get('resource'));
    if (resource === 'session') return json({ ...(await query('SELECT CURRENT_USER() AS user_name,CURRENT_ROLE() AS role_name'))[0], data_schema: prefix });
    if (resource === 'products') {
      const [products, makers] = await Promise.all([
        query(`SELECT product.product_slug,product.product_name,supply.supplier_company,COALESCE(documents.n_input_docs,0) AS n_input_docs,COALESCE(documents.n_output_docs,0) AS n_output_docs FROM ${prefix}.PRODUCT product LEFT JOIN ${prefix}.PRODUCT_SUPPLY supply ON supply.product_slug=product.product_slug LEFT JOIN (SELECT product_slug,COUNT_IF(doc_role='input') AS n_input_docs,COUNT_IF(doc_role='output') AS n_output_docs FROM ${prefix}.DOCUMENT_V GROUP BY product_slug) documents ON documents.product_slug=product.product_slug ORDER BY product.product_name`),
        query(`SELECT DISTINCT product_slug,raw_value AS maker_name FROM ${prefix}.CANDIDATE_V WHERE attr_key='maker_name' ORDER BY maker_name`),
      ]);
      return json({ products, makers });
    }
    if (resource === 'coverage') {
      // Per-form coverage of the received originals. Read without a product because
      // it describes the forms themselves, not one product's progress.
      return json(await query(`SELECT form_id,customer,form_name,template_fields,mapped_fields,business_only_fields,signature_fields,layout_versions,reviewed_versions,approved_versions,source_files,source_pages,source_hashes,applicability_status FROM ${prefix}.FORM_COVERAGE_V ORDER BY form_id`));
    }
    const product = key.parse(search.get('product'));
    let sql: string;
    const binds: (string | number | null)[] = [product];
    switch (resource) {
      case 'upload_impact': sql = `SELECT product_slug,n_decided,n_confirmed,n_test FROM ${prefix}.UPLOAD_IMPACT_V WHERE product_slug=?`; break;
      // Documents handed over during a meeting, with whether they have been
      // structured. Both counts are reported because a catalog document produces
      // only gap rows, so extraction alone does not say whether work exists.
      case 'uploads': sql = `SELECT document.stage_path,document.original_filename,document.doc_type,document.doc_role,document.upload_purpose,
        (SELECT COUNT(*) FROM ${prefix}.DOC_EXTRACT extract WHERE extract.stage_path=document.stage_path) AS n_extract,
        (SELECT COUNT(*) FROM ${prefix}.DOC_EXTRACT_GAP gap WHERE gap.stage_path=document.stage_path) AS n_gap,
        (SELECT COUNT(*) FROM ${prefix}.CANDIDATE_V candidate WHERE candidate.source_path=document.stage_path) AS n_candidates
        FROM ${prefix}.DOCUMENT_ALL_V document
        WHERE document.product_slug=? AND document.stage_path LIKE 'uploads/%' AND document.is_current
        ORDER BY document.stage_path`; break;
      // What the AI read for one document. Scoped by product so a transcription
      // cannot be read through another product's selection.
      case 'transcript':
        binds.push(documentPath.parse(search.get('path')));
        sql = `SELECT page_index,content,page_count,parsed_at FROM ${prefix}.DOC_PARSE WHERE product_slug=? AND stage_path=? ORDER BY page_index`; break;
      // Everything the AI extracted from one document, for read-only inspection in
      // the structuring test tab. Scoped by product and path like the transcript,
      // and it deliberately carries no decision state: confirming a value is the
      // job of tabs 01 and 02, which read the production-only views.
      case 'extraction':
        binds.push(documentPath.parse(search.get('path')));
        sql = `SELECT candidate.attr_key,COALESCE(def.attr_label,candidate.attr_key) AS attr_label,
          candidate.raw_value,candidate.source_label,candidate.is_primary
          FROM ${prefix}.CANDIDATE_V candidate
          LEFT JOIN ${prefix}.ATTR_DEF def ON def.attr_key=candidate.attr_key
          WHERE candidate.product_slug=? AND candidate.source_path=?
          ORDER BY def.display_order NULLS LAST,candidate.attr_key,candidate.is_primary DESC`; break;
      // Everything a bulk confirm needs in one read: the attributes awaiting review
      // and every candidate for each of them, so the list can be shown with the
      // primary value preselected and the alternatives switchable per row without a
      // request per attribute. Rows with no candidate are absent because there is
      // nothing to confirm; they stay in the one-by-one flow.
      case 'bulk_master':
        sql = `SELECT review.attr_key,review.attr_label,review.section,review.display_order,
          review.revision,review.current_signature,review.status,review.n_values,
          candidate.candidate_id,candidate.raw_value,candidate.source_label,candidate.is_primary
          FROM ${prefix}.MASTER_REVIEW_V review
          JOIN ${prefix}.CANDIDATE_V candidate
            ON candidate.product_slug=review.product_slug AND candidate.attr_key=review.attr_key
          WHERE review.product_slug=? AND review.status IN ('review','changed')
          ORDER BY review.display_order,review.attr_key,candidate.is_primary DESC,candidate.source_label`; break;
      // Every remaining reason a submission PDF cannot be produced for this
      // product and form, one row per field plus the layout-level reasons.
      case 'blockers':
        binds.push(key.parse(search.get('form')));
        sql = `SELECT layout_id,version,field_key,field_label,blocker,detail FROM ${prefix}.SUBMISSION_BLOCKER_V WHERE product_slug=? AND form_id=? ORDER BY layout_id,version,blocker,field_key`; break;
      case 'master': sql = `SELECT * FROM ${prefix}.MASTER_REVIEW_V WHERE product_slug=? ORDER BY display_order`; break;
      case 'documents': sql = `SELECT * FROM ${prefix}.DOCUMENT_V WHERE product_slug=? ORDER BY doc_role,original_filename`; break;
      case 'forms': sql = `SELECT * FROM ${prefix}.PRODUCT_FORM_V WHERE product_slug=? ORDER BY is_designated DESC,form_id`; break;
      case 'issues': sql = `SELECT * FROM ${prefix}.EXTRACTION_ISSUE_V WHERE product_slug=? ORDER BY stage_path`; break;
      case 'history': sql = `SELECT acted_at,scope_id,field_key,action,old_record:value::STRING AS old_value,new_record:value::STRING AS new_value,actor FROM ${prefix}.DECISION_HISTORY WHERE product_slug=? ORDER BY acted_at DESC LIMIT 100`; break;
      case 'candidates':
        binds.push(key.parse(search.get('attr')));
        sql = `SELECT candidate.*,note.note AS review_note FROM ${prefix}.CANDIDATE_V candidate LEFT JOIN ${prefix}.SOURCE_REVIEW_NOTE note ON note.stage_path=candidate.source_path AND note.attr_key=candidate.attr_key AND note.raw_value=candidate.raw_value AND note.version_key=candidate.version_key WHERE candidate.product_slug=? AND candidate.attr_key=? ORDER BY is_primary DESC,source_label,candidate_id`; break;
      case 'fields':
        binds.push(key.parse(search.get('form')));
        sql = `SELECT * FROM ${prefix}.FORM_REVIEW_V WHERE product_slug=? AND form_id=? ORDER BY display_order,field_key`; break;
      case 'references':
        binds.push(key.parse(search.get('form')));
        sql = `SELECT doc.stage_path,doc.original_filename,doc.version_key,doc.is_current FROM ${prefix}.GROUND_TRUTH ground JOIN ${prefix}.DOCUMENT_V doc ON doc.stage_path=ground.stage_path WHERE ground.product_slug=? AND doc.customer_key IN (SELECT ${prefix}.NORMALIZE_TEXT(submit_to) FROM ${prefix}.CUSTOMER_FORM_MAP WHERE form_id=?) ORDER BY ground.stage_path`; break;
      case 'batch':
        const action = z.enum(['apply', 'apply_with_skips', 'reset']).parse(search.get('action'));
        const scope = key.parse(search.get('scope'));
        // The skips views cost 8-60s to compile, and the demo export reads them on
        // every click even when the previous click already applied everything. An
        // empty answer is therefore remembered until any table in the schema changes:
        // every write that could put a row back into these views (batch, decide,
        // upload, structure) is DML on this schema, which advances LAST_ALTERED. The
        // RAW originals stage is read-only for the app, so it cannot change the answer
        // behind our back. Only empty answers are kept — a non-empty one is about to
        // be applied, which changes the tables anyway.
        const cacheKey = action === 'apply_with_skips' ? `${product}|${scope}` : '';
        let mark = '';
        if (cacheKey) {
          const [latest] = await query<{ mark: string }>(`SELECT TO_VARCHAR(MAX(last_altered)) AS mark FROM ${database}.INFORMATION_SCHEMA.TABLES WHERE table_schema=? AND table_type='BASE TABLE'`, [schema]);
          mark = String(latest?.mark ?? '');
          if (mark && emptyBatch.get(cacheKey) === mark) return json([]);
        }
        binds.push(scope, scope);
        const view = action === 'reset' ? 'TEST_RESET_PREVIEW_V' : scope === 'master'
          ? action === 'apply' ? 'TEST_MASTER_APPLY_V' : 'TEST_MASTER_SKIPS_V'
          : action === 'apply' ? 'TEST_FORM_APPLY_V' : 'TEST_FORM_SKIPS_V';
        sql = `SELECT scope_id,field_key,label,revision,signature,value,candidate_id,source_label,selected_attr,target_state,old_record:state::STRING AS previous_state FROM ${prefix}.${view} WHERE product_slug=? AND (?='all' OR scope_id=?) ORDER BY scope_id,field_key`;
        const rows = await query(sql, binds);
        if (cacheKey && mark) { if (rows.length) emptyBatch.delete(cacheKey); else emptyBatch.set(cacheKey, mark); }
        return json(rows);
    }
    return json(await query(sql, binds));
  } catch (error) { return failure(error); }
  });
}