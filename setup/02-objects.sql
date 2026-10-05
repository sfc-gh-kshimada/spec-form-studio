-- 02: stages, tables, views, functions and procedures, in creation order.
-- Applied by scripts/setup.sh with __DB__ / __SCHEMA__ substituted.
USE SCHEMA __DB__.__SCHEMA__;

-- Original documents. Load the customer's existing PDFs here, e.g.
--   PUT file://./originals/*.pdf @__DB__.__SCHEMA__.RAW AUTO_COMPRESS = FALSE;
CREATE STAGE IF NOT EXISTS __DB__.__SCHEMA__.RAW
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = '既存の原本。アプリからは読み取りのみ。';

-- Documents received during a meeting, uploaded through the app.
CREATE STAGE IF NOT EXISTS __DB__.__SCHEMA__.UPLOADS
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = '打ち合わせでその場で受け取った原本。既存のRAW原本とは分離する。';

USE SCHEMA __DB__.__SCHEMA__;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.PRODUCT (
	PRODUCT_SLUG VARCHAR(16777216),
	PRODUCT_NAME VARCHAR(16777216),
	N_DOCS NUMBER(18,0)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.ATTR_DEF (
	ATTR_KEY VARCHAR(16777216),
	ATTR_LABEL VARCHAR(16777216),
	SECTION VARCHAR(16777216),
	DISPLAY_ORDER NUMBER(38,0),
	SOURCE_KIND VARCHAR(16777216) COMMENT 'document / business / customer / derived',
	PRIMARY_DOC_TYPES ARRAY COMMENT '一次情報とみなす文書種別。ここ以外からの値は要確認',
	DOC_COVERAGE_PCT NUMBER(38,0) COMMENT '実測カバレッジ。document 以外は NULL',
	ALWAYS_REVIEW BOOLEAN DEFAULT FALSE COMMENT '実測で誤りが多い属性。裏付けが厚くても必ず人が確認する',
	NOTE VARCHAR(16777216)
)COMMENT='管理対象の製品属性の定義'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.ATTR_SOURCE_MAP (
	EXTRACT_KEY VARCHAR(16777216),
	ATTR_KEY VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216) COMMENT 'この対応を適用する文書種別。* は全種別',
	IS_PRIMARY BOOLEAN
)COMMENT='抽出結果のキーを属性キーへ対応づける'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.PRODUCT_SUPPLY (
	PRODUCT_SLUG VARCHAR(16777216),
	PRODUCT_NAME_SRC VARCHAR(16777216),
	SUPPLIER_COMPANY VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216),
	N_INPUT_DOCS NUMBER(18,0),
	HAS_DOCUMENTS BOOLEAN,
	N_OUTPUT_DOCS NUMBER(18,0),
	HAS_OUTPUT_SAMPLE BOOLEAN
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_REGISTRY (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_ROLE VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXT VARCHAR(16777216),
	SIZE_BYTES NUMBER(38,0),
	ORIGINAL_FILENAME VARCHAR(16777216),
	SHA256 VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216) COMMENT '提出先。成果物のファイル名【】から取得。input では NULL',
	UPLOAD_PURPOSE VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_CLASSIFIED (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	ORIGINAL_FILENAME VARCHAR(16777216),
	DOC_TYPE_FILENAME VARCHAR(16777216),
	DOC_KIND VARCHAR(16777216),
	DOC_TITLE VARCHAR(16777216),
	HAS_LOT VARCHAR(16777216),
	DOC_KIND_SCORE FLOAT,
	ERR VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_EXTRACT (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXTRACTED VARIANT,
	SCORES VARIANT,
	ERR VARCHAR(16777216),
	EXTRACTED_AT TIMESTAMP_LTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_EXTRACT_GAP (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXTRACTED VARIANT,
	SCORES VARIANT,
	ERR VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_TEMPLATE (
	FORM_ID VARCHAR(16777216),
	CUSTOMER VARCHAR(16777216),
	FORM_NAME VARCHAR(16777216),
	FIELD_KEY VARCHAR(16777216),
	FIELD_LABEL VARCHAR(16777216),
	GUIDANCE VARCHAR(16777216),
	BUSINESS_ONLY BOOLEAN,
	DISPLAY_ORDER NUMBER(38,0),
	SECTION VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_ATTR_MAP (
	FORM_ID VARCHAR(16777216),
	FIELD_KEY VARCHAR(16777216),
	ATTR_KEY VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_IMPORT_RAW (
	FORM_ID VARCHAR(16777216),
	STAGE_PATH VARCHAR(16777216),
	EXTRACTED VARIANT,
	ERR VARCHAR(16777216),
	IMPORTED_AT TIMESTAMP_LTZ(9) DEFAULT CURRENT_TIMESTAMP()
)COMMENT='様式取り込みのAI生出力'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.GROUND_TRUTH (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	ORIGINAL_FILENAME VARCHAR(16777216),
	GT VARIANT,
	GT_SCORES VARIANT,
	ERR VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216) COMMENT '提出先。ファイル名【】由来（DOC_REGISTRY.submit_to）',
	EXTRACTED_AT TIMESTAMP_LTZ(9)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.CUSTOMER_FORM_MAP (
	SUBMIT_TO VARCHAR(16777216) COMMENT '商流マスタ／ファイル名【】の提出先表記',
	FORM_ID VARCHAR(16777216),
	NOTE VARCHAR(16777216)
)COMMENT='提出先と取引先様式の対応'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_VERSION (
	STAGE_PATH VARCHAR(16777216),
	MD5 VARCHAR(16777216),
	SIZE_BYTES NUMBER(38,0),
	LAST_MODIFIED TIMESTAMP_TZ(3),
	CAPTURED_AT TIMESTAMP_LTZ(9)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE (
	STAGE_PATH VARCHAR(16777216) NOT NULL,
	ATTR_KEY VARCHAR(16777216) NOT NULL,
	RAW_VALUE VARCHAR(16777216) NOT NULL,
	VERSION_KEY VARCHAR(16777216) NOT NULL,
	NOTE VARCHAR(16777216) NOT NULL,
	REVIEWED_BY VARCHAR(16777216) NOT NULL,
	REVIEWED_AT TIMESTAMP_LTZ(9) NOT NULL DEFAULT CURRENT_TIMESTAMP()
);
USE SCHEMA __DB__.__SCHEMA__;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.PRODUCT (
	PRODUCT_SLUG VARCHAR(16777216),
	PRODUCT_NAME VARCHAR(16777216),
	N_DOCS NUMBER(18,0)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.ATTR_DEF (
	ATTR_KEY VARCHAR(16777216),
	ATTR_LABEL VARCHAR(16777216),
	SECTION VARCHAR(16777216),
	DISPLAY_ORDER NUMBER(38,0),
	SOURCE_KIND VARCHAR(16777216) COMMENT 'document / business / customer / derived',
	PRIMARY_DOC_TYPES ARRAY COMMENT '一次情報とみなす文書種別。ここ以外からの値は要確認',
	DOC_COVERAGE_PCT NUMBER(38,0) COMMENT '実測カバレッジ。document 以外は NULL',
	ALWAYS_REVIEW BOOLEAN DEFAULT FALSE COMMENT '実測で誤りが多い属性。裏付けが厚くても必ず人が確認する',
	NOTE VARCHAR(16777216)
)COMMENT='管理対象の製品属性の定義'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.ATTR_SOURCE_MAP (
	EXTRACT_KEY VARCHAR(16777216),
	ATTR_KEY VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216) COMMENT 'この対応を適用する文書種別。* は全種別',
	IS_PRIMARY BOOLEAN
)COMMENT='抽出結果のキーを属性キーへ対応づける'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.PRODUCT_SUPPLY (
	PRODUCT_SLUG VARCHAR(16777216),
	PRODUCT_NAME_SRC VARCHAR(16777216),
	SUPPLIER_COMPANY VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216),
	N_INPUT_DOCS NUMBER(18,0),
	HAS_DOCUMENTS BOOLEAN,
	N_OUTPUT_DOCS NUMBER(18,0),
	HAS_OUTPUT_SAMPLE BOOLEAN
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_REGISTRY (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_ROLE VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXT VARCHAR(16777216),
	SIZE_BYTES NUMBER(38,0),
	ORIGINAL_FILENAME VARCHAR(16777216),
	SHA256 VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216) COMMENT '提出先。成果物のファイル名【】から取得。input では NULL',
	UPLOAD_PURPOSE VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_CLASSIFIED (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	ORIGINAL_FILENAME VARCHAR(16777216),
	DOC_TYPE_FILENAME VARCHAR(16777216),
	DOC_KIND VARCHAR(16777216),
	DOC_TITLE VARCHAR(16777216),
	HAS_LOT VARCHAR(16777216),
	DOC_KIND_SCORE FLOAT,
	ERR VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_EXTRACT (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXTRACTED VARIANT,
	SCORES VARIANT,
	ERR VARCHAR(16777216),
	EXTRACTED_AT TIMESTAMP_LTZ(9) DEFAULT CURRENT_TIMESTAMP()
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_EXTRACT_GAP (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	DOC_TYPE VARCHAR(16777216),
	EXTRACTED VARIANT,
	SCORES VARIANT,
	ERR VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_TEMPLATE (
	FORM_ID VARCHAR(16777216),
	CUSTOMER VARCHAR(16777216),
	FORM_NAME VARCHAR(16777216),
	FIELD_KEY VARCHAR(16777216),
	FIELD_LABEL VARCHAR(16777216),
	GUIDANCE VARCHAR(16777216),
	BUSINESS_ONLY BOOLEAN,
	DISPLAY_ORDER NUMBER(38,0),
	SECTION VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_ATTR_MAP (
	FORM_ID VARCHAR(16777216),
	FIELD_KEY VARCHAR(16777216),
	ATTR_KEY VARCHAR(16777216)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_IMPORT_RAW (
	FORM_ID VARCHAR(16777216),
	STAGE_PATH VARCHAR(16777216),
	EXTRACTED VARIANT,
	ERR VARCHAR(16777216),
	IMPORTED_AT TIMESTAMP_LTZ(9) DEFAULT CURRENT_TIMESTAMP()
)COMMENT='様式取り込みのAI生出力'
;
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.GROUND_TRUTH (
	STAGE_PATH VARCHAR(16777216),
	PRODUCT_SLUG VARCHAR(16777216),
	ORIGINAL_FILENAME VARCHAR(16777216),
	GT VARIANT,
	GT_SCORES VARIANT,
	ERR VARCHAR(16777216),
	SUBMIT_TO VARCHAR(16777216) COMMENT '提出先。ファイル名【】由来（DOC_REGISTRY.submit_to）',
	EXTRACTED_AT TIMESTAMP_LTZ(9)
);
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.CUSTOMER_FORM_MAP (
	SUBMIT_TO VARCHAR(16777216) COMMENT '商流マスタ／ファイル名【】の提出先表記',
	FORM_ID VARCHAR(16777216),
	NOTE VARCHAR(16777216)
)COMMENT='提出先と取引先様式の対応'
;

CREATE OR REPLACE FUNCTION __DB__.__SCHEMA__.TEXT_VALUE(raw_text STRING)
RETURNS STRING LANGUAGE SQL AS $$
  CASE WHEN raw_text IS NULL OR LOWER(TRIM(raw_text)) IN
    ('', 'none', 'null', '要確認', '未記載', '記載なし', '不明', '確認中')
    THEN NULL ELSE TRIM(raw_text) END
$$;

CREATE OR REPLACE FUNCTION __DB__.__SCHEMA__.NORMALIZE_TEXT(raw_text STRING)
RETURNS STRING LANGUAGE PYTHON RUNTIME_VERSION = '3.11' HANDLER = 'normalize'
AS $$
import unicodedata
def normalize(raw_text):
    if raw_text is None:
        return None
    return ' '.join(unicodedata.normalize('NFKC', raw_text).split()).casefold()
$$;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_VERSION AS
SELECT relative_path AS stage_path, md5, size AS size_bytes,
       last_modified, CURRENT_TIMESTAMP() AS captured_at
FROM DIRECTORY(@__DB__.__SCHEMA__.RAW);

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.DOCUMENT_V AS
SELECT registry.stage_path, registry.product_slug, registry.original_filename,
       CASE WHEN registry.doc_role = 'output'
              OR registry.doc_type = 'deliverable'
              OR LOWER(classified.doc_kind) = 'form'
            THEN 'output' ELSE registry.doc_role END AS doc_role,
       COALESCE(LOWER(classified.doc_kind), registry.doc_type) AS doc_type,
       classified.doc_title, registry.ext,
       registry.submit_to, __DB__.__SCHEMA__.NORMALIZE_TEXT(registry.submit_to) AS customer_key,
       version.md5 AS captured_md5, directory.md5 AS current_md5,
       directory.size AS size_bytes,
       (directory.relative_path IS NOT NULL
        AND version.md5 IS NOT NULL
        AND EQUAL_NULL(version.md5, directory.md5)
        AND EQUAL_NULL(version.last_modified, directory.last_modified)) AS is_current,
       SHA2(CONCAT_WS('|', registry.stage_path, COALESCE(directory.md5, 'missing'),
            COALESCE(TO_CHAR(CONVERT_TIMEZONE('UTC', directory.last_modified),
                            'YYYY-MM-DD"T"HH24:MI:SS.FF9'), 'missing')), 256) AS version_key
FROM __DB__.__SCHEMA__.DOC_REGISTRY registry
LEFT JOIN __DB__.__SCHEMA__.DOC_CLASSIFIED classified ON classified.stage_path = registry.stage_path
LEFT JOIN __DB__.__SCHEMA__.DOC_VERSION version ON version.stage_path = registry.stage_path
LEFT JOIN DIRECTORY(@__DB__.__SCHEMA__.RAW) directory
       ON directory.relative_path = registry.stage_path;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.CANDIDATE_V AS
WITH extracted AS (
  SELECT stage_path, doc_type, extracted FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE err IS NULL
  UNION ALL
  SELECT stage_path, doc_type, extracted FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP WHERE err IS NULL
), flat AS (
  SELECT extracted.stage_path, extracted.doc_type, item.key::STRING AS extract_key,
         __DB__.__SCHEMA__.TEXT_VALUE(item.value::STRING) AS raw_value
  FROM extracted, LATERAL FLATTEN(input => extracted.extracted) item
), document_values AS (
  SELECT DISTINCT doc.product_slug, mapping.attr_key, flat.raw_value,
         doc.stage_path AS source_path, doc.original_filename AS source_label,
         doc.version_key, mapping.is_primary, 'document' AS source_kind
  FROM flat
  JOIN __DB__.__SCHEMA__.DOCUMENT_V doc ON doc.stage_path = flat.stage_path
  JOIN __DB__.__SCHEMA__.ATTR_SOURCE_MAP mapping
    ON mapping.extract_key = flat.extract_key
   AND (mapping.doc_type = '*' OR mapping.doc_type = flat.doc_type)
  WHERE doc.doc_role = 'input' AND doc.is_current AND flat.raw_value IS NOT NULL
), business_values AS (
  SELECT product_slug, 'supplier_company' AS attr_key,
         supplier_company AS raw_value, NULL AS source_path,
         '顧客提供 商品・仕入先・顧客表' AS source_label,
         SHA2(COALESCE(supplier_company, ''), 256) AS version_key,
         TRUE AS is_primary, 'customer_master' AS source_kind
  FROM __DB__.__SCHEMA__.PRODUCT_SUPPLY WHERE supplier_company IS NOT NULL
), all_values AS (
  SELECT * FROM document_values
  UNION ALL
  SELECT * FROM business_values
)
SELECT SHA2(TO_JSON(ARRAY_CONSTRUCT(product_slug, attr_key, raw_value,
              source_path, version_key, is_primary)), 256) AS candidate_id,
       product_slug, attr_key, raw_value,
       __DB__.__SCHEMA__.NORMALIZE_TEXT(raw_value) AS compare_value,
       source_path, source_label, version_key, is_primary, source_kind
FROM all_values;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.EVIDENCE_V AS
SELECT product_slug, attr_key, COUNT(*) AS n_candidates,
       COUNT(DISTINCT compare_value) AS n_values,
       COUNT(DISTINCT source_path) AS n_documents,
       SHA2(LISTAGG(candidate_id, '|') WITHIN GROUP (ORDER BY candidate_id), 256) AS signature
FROM __DB__.__SCHEMA__.CANDIDATE_V GROUP BY product_slug, attr_key;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.MASTER_DECISION (
  product_slug STRING NOT NULL, attr_key STRING NOT NULL,
  value STRING, decision_state STRING NOT NULL DEFAULT 'pending',
  candidate_id STRING, source_path STRING, source_label STRING,
  source_kind STRING, source_note STRING,
  evidence_signature STRING, revision NUMBER NOT NULL DEFAULT 0,
  decided_by STRING, decided_at TIMESTAMP_LTZ,
  PRIMARY KEY(product_slug, attr_key)
);

INSERT INTO __DB__.__SCHEMA__.MASTER_DECISION(product_slug, attr_key)
SELECT product.product_slug, definition.attr_key
FROM __DB__.__SCHEMA__.PRODUCT product CROSS JOIN __DB__.__SCHEMA__.ATTR_DEF definition
WHERE NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.MASTER_DECISION decision
  WHERE decision.product_slug = product.product_slug AND decision.attr_key = definition.attr_key);

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DECISION_HISTORY (
  event_id STRING NOT NULL, product_slug STRING NOT NULL,
  scope_id STRING NOT NULL, field_key STRING NOT NULL,
  action STRING NOT NULL, old_record VARIANT, new_record VARIANT,
  actor STRING NOT NULL, acted_at TIMESTAMP_LTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.MASTER_REVIEW_V AS
WITH input_health AS (
  SELECT product_slug,COUNT(*) AS stale_inputs FROM __DB__.__SCHEMA__.DOCUMENT_V
  WHERE doc_role='input' AND NOT is_current GROUP BY product_slug
)
SELECT decision.*, definition.attr_label, definition.section, definition.display_order,
       COALESCE(evidence.signature, SHA2('', 256)) AS current_signature,
       COALESCE(evidence.n_candidates, 0) AS n_candidates,
       COALESCE(evidence.n_values, 0) AS n_values,
       COALESCE(evidence.n_documents, 0) AS n_documents,
       CASE
         WHEN decision.decision_state='test_skipped' AND COALESCE(health.stale_inputs,0)>0 THEN 'changed'
         WHEN decision.decision_state IN ('confirmed','test_confirmed','test_skipped','rejected')
          AND NOT EQUAL_NULL(decision.evidence_signature,
                             COALESCE(evidence.signature, SHA2('', 256))) THEN 'changed'
         WHEN decision.decision_state = 'confirmed' THEN 'confirmed'
         WHEN decision.decision_state = 'test_confirmed' THEN 'test_confirmed'
         WHEN decision.decision_state = 'test_skipped' THEN 'test_skipped'
         WHEN decision.decision_state = 'rejected' THEN 'rejected'
         WHEN COALESCE(evidence.n_candidates, 0) = 0 THEN 'missing'
         ELSE 'review'
       END AS status
FROM __DB__.__SCHEMA__.MASTER_DECISION decision
JOIN __DB__.__SCHEMA__.ATTR_DEF definition ON definition.attr_key = decision.attr_key
LEFT JOIN input_health health ON health.product_slug=decision.product_slug
LEFT JOIN __DB__.__SCHEMA__.EVIDENCE_V evidence
  ON evidence.product_slug = decision.product_slug AND evidence.attr_key = decision.attr_key;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.PRODUCT_V AS
WITH document_counts AS (
  SELECT product_slug, COALESCE(COUNT_IF(doc_role='input'),0) AS n_input_docs,
         COALESCE(COUNT_IF(doc_role='output'),0) AS n_output_docs
  FROM __DB__.__SCHEMA__.DOCUMENT_V GROUP BY product_slug
), review_counts AS (
  SELECT product_slug, COUNT(*) AS n_attrs,
         COALESCE(COUNT_IF(status='confirmed'),0) AS n_confirmed,
         COALESCE(COUNT_IF(status='review'),0) AS n_review,
         COALESCE(COUNT_IF(status='changed'),0) AS n_changed,
         COALESCE(COUNT_IF(status='missing'),0) AS n_missing
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V GROUP BY product_slug
)
SELECT product.product_slug, product.product_name, supply.supplier_company,
       COALESCE(documents.n_input_docs,0) AS n_input_docs,
       COALESCE(documents.n_output_docs,0) AS n_output_docs,
       review.n_attrs, review.n_confirmed, review.n_review, review.n_changed, review.n_missing
FROM __DB__.__SCHEMA__.PRODUCT product
LEFT JOIN __DB__.__SCHEMA__.PRODUCT_SUPPLY supply ON supply.product_slug = product.product_slug
LEFT JOIN document_counts documents ON documents.product_slug = product.product_slug
JOIN review_counts review ON review.product_slug = product.product_slug;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.FORM_FIELD_V AS
SELECT template.*, mapping.attr_key AS suggested_attr,
       CONTAINS(COALESCE(template.guidance,''), '【必須】') AS required,
       SHA2(TO_JSON(ARRAY_CONSTRUCT(template.form_id, template.field_key,
              template.field_label, template.guidance, mapping.attr_key)),256) AS template_signature
FROM __DB__.__SCHEMA__.FORM_TEMPLATE template LEFT JOIN __DB__.__SCHEMA__.FORM_ATTR_MAP mapping
  ON mapping.form_id = template.form_id AND mapping.field_key = template.field_key;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.PRODUCT_FORM_V AS
WITH forms AS (
  SELECT form_id, MIN(customer) AS customer, MIN(form_name) AS form_name,
         COUNT(*) AS n_fields FROM __DB__.__SCHEMA__.FORM_TEMPLATE GROUP BY form_id
), customers AS (
  SELECT DISTINCT product_slug, customer_key FROM __DB__.__SCHEMA__.DOCUMENT_V
  WHERE doc_role = 'output' AND customer_key IS NOT NULL
  UNION
  SELECT product_slug, __DB__.__SCHEMA__.NORMALIZE_TEXT(submit_to) FROM __DB__.__SCHEMA__.PRODUCT_SUPPLY WHERE submit_to IS NOT NULL
), designated AS (
  SELECT DISTINCT customers.product_slug, mapping.form_id
  FROM customers JOIN __DB__.__SCHEMA__.CUSTOMER_FORM_MAP mapping
    ON __DB__.__SCHEMA__.NORMALIZE_TEXT(mapping.submit_to) = customers.customer_key
)
SELECT product.product_slug, forms.*,
       (designated.form_id IS NOT NULL) AS is_designated
FROM __DB__.__SCHEMA__.PRODUCT product CROSS JOIN forms
LEFT JOIN designated ON designated.product_slug = product.product_slug AND designated.form_id = forms.form_id;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_DECISION (
  product_slug STRING NOT NULL, form_id STRING NOT NULL, field_key STRING NOT NULL,
  value STRING, decision_state STRING NOT NULL DEFAULT 'pending',
  selected_attr STRING, master_revision NUMBER, source_path STRING,
  source_version STRING, source_note STRING, template_signature STRING, master_signature STRING,
  revision NUMBER NOT NULL DEFAULT 0, decided_by STRING, decided_at TIMESTAMP_LTZ,
  PRIMARY KEY(product_slug,form_id,field_key)
);

ALTER TABLE __DB__.__SCHEMA__.FORM_DECISION ADD COLUMN IF NOT EXISTS master_signature STRING;

INSERT INTO __DB__.__SCHEMA__.FORM_DECISION(product_slug,form_id,field_key)
SELECT product.product_slug, template.form_id, template.field_key
FROM __DB__.__SCHEMA__.PRODUCT product CROSS JOIN __DB__.__SCHEMA__.FORM_TEMPLATE template
WHERE NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.FORM_DECISION decision WHERE decision.product_slug=product.product_slug
  AND decision.form_id=template.form_id AND decision.field_key=template.field_key);

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.FORM_REVIEW_V AS
WITH input_health AS (
  SELECT product_slug,COUNT(*) AS stale_inputs FROM __DB__.__SCHEMA__.DOCUMENT_V
  WHERE doc_role='input' AND NOT is_current GROUP BY product_slug
), resolved AS (
  SELECT decision.*, field.field_label, field.section, field.display_order,
         field.guidance, field.required, field.suggested_attr,
         field.template_signature AS current_template_signature,
         master.status AS linked_master_status, master.revision AS current_master_revision,
         document.version_key AS current_source_version,
         document.is_current AS source_is_current,
         CASE
           WHEN decision.decision_state NOT IN ('confirmed','test_confirmed','test_skipped') THEN 'pending'
           WHEN NOT EQUAL_NULL(decision.template_signature, field.template_signature) THEN 'changed'
           WHEN decision.decision_state='test_skipped' AND COALESCE(health.stale_inputs,0)>0 THEN 'changed'
           WHEN decision.decision_state='test_skipped' AND decision.selected_attr IS NOT NULL AND
             (COALESCE(master.status,'absent') NOT IN ('missing','test_skipped')
              OR NOT EQUAL_NULL(decision.master_revision,master.revision)
              OR NOT EQUAL_NULL(decision.master_signature,master.current_signature)) THEN 'changed'
           WHEN decision.decision_state<>'test_skipped' AND decision.selected_attr IS NOT NULL AND
             ((COALESCE(master.status,'missing') <> 'confirmed'
               AND NOT (decision.decision_state='test_confirmed' AND COALESCE(master.status,'missing')='test_confirmed'))
              OR NOT EQUAL_NULL(decision.master_revision,master.revision)) THEN 'changed'
           WHEN decision.source_path IS NOT NULL AND
             (NOT COALESCE(document.is_current,FALSE)
              OR NOT EQUAL_NULL(decision.source_version,document.version_key)) THEN 'changed'
           ELSE decision.decision_state
         END AS status
  FROM __DB__.__SCHEMA__.FORM_DECISION decision
  JOIN __DB__.__SCHEMA__.FORM_FIELD_V field ON field.form_id=decision.form_id AND field.field_key=decision.field_key
  LEFT JOIN input_health health ON health.product_slug=decision.product_slug
  LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master ON master.product_slug=decision.product_slug AND master.attr_key=decision.selected_attr
  LEFT JOIN __DB__.__SCHEMA__.DOCUMENT_V document ON document.stage_path=decision.source_path
)
SELECT resolved.*, IFF(status='confirmed', value, NULL) AS output_value FROM resolved;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.EXTRACTION_ISSUE_V AS
SELECT extracted.product_slug, extracted.stage_path, '補完抽出' AS step, extracted.err
FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP extracted WHERE err IS NOT NULL
UNION ALL
SELECT extracted.product_slug, extracted.stage_path, '属性抽出', extracted.err
FROM __DB__.__SCHEMA__.DOC_EXTRACT extracted WHERE err IS NOT NULL
UNION ALL
SELECT product_slug, stage_path, '文書差し替え・削除', '原本が変わりました。再抽出が必要です。'
FROM __DB__.__SCHEMA__.DOCUMENT_V WHERE NOT is_current;

SELECT (SELECT COUNT(*) FROM __DB__.__SCHEMA__.PRODUCT) AS products,
       (SELECT COUNT(*) FROM __DB__.__SCHEMA__.MASTER_DECISION) AS master_rows,
       (SELECT COUNT(*) FROM __DB__.__SCHEMA__.FORM_TEMPLATE) AS form_fields,
       (SELECT COUNT(*) FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE status='confirmed') AS confirmed;
USE SCHEMA __DB__.__SCHEMA__;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.DECIDE_MASTER(
  p_product STRING, p_attr STRING, p_revision NUMBER, p_signature STRING,
  p_action STRING, p_candidate STRING, p_value STRING, p_note STRING)
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  old_record VARIANT;
  new_record VARIANT;
  current_signature STRING;
  chosen_value STRING;
  chosen_path STRING;
  chosen_label STRING;
  chosen_kind STRING;
  affected NUMBER;
BEGIN
  IF (p_action IS NULL OR p_action NOT IN ('approve','manual','reject','reopen')) THEN
    RETURN 'エラー: 不明な操作です。';
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN 'エラー: 確認内容・出所を記入してください。';
  END IF;
  BEGIN TRANSACTION;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION SET revision=revision+1
  WHERE product_slug=:p_product AND attr_key=:p_attr AND revision=:p_revision;
  affected := SQLROWCOUNT;
  IF (affected <> 1) THEN
    ROLLBACK;
    RETURN 'エラー: 他の操作で更新されました。再読み込みしてください。';
  END IF;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,
    'revision',revision-1,'candidate_id',candidate_id,'source_path',source_path,
    'source_kind',source_kind,'source_note',source_note,'signature',evidence_signature),
    current_signature INTO :old_record, :current_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE product_slug=:p_product AND attr_key=:p_attr;
  IF (NOT EQUAL_NULL(current_signature,p_signature)) THEN
    ROLLBACK;
    RETURN 'エラー: 根拠文書が更新されました。再読み込みしてください。';
  END IF;
  IF (p_action='approve') THEN
    SELECT MAX(raw_value),MAX(source_path),MAX(source_label),MAX(source_kind),COUNT(*)
      INTO :chosen_value,:chosen_path,:chosen_label,:chosen_kind,:affected
    FROM __DB__.__SCHEMA__.CANDIDATE_V WHERE product_slug=:p_product AND attr_key=:p_attr AND candidate_id=:p_candidate;
    IF (affected<>1 OR chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 候補が更新されました。再読み込みしてください。';
    END IF;
  ELSEIF (p_action='manual') THEN
    chosen_value := __DB__.__SCHEMA__.TEXT_VALUE(:p_value);
    chosen_kind := 'manual';
    chosen_label := '担当者による確認';
    IF (chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 値を記入してください。';
    END IF;
  END IF;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION
  SET value=:chosen_value,
      decision_state=CASE WHEN :p_action IN ('approve','manual') THEN 'confirmed'
                          WHEN :p_action='reject' THEN 'rejected' ELSE 'pending' END,
      candidate_id=IFF(:p_action='approve',:p_candidate,NULL),
      source_path=:chosen_path,source_label=:chosen_label,source_kind=:chosen_kind,
      source_note=:p_note,evidence_signature=:current_signature,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  WHERE product_slug=:p_product AND attr_key=:p_attr;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,
    'revision',revision,'candidate_id',candidate_id,'source_path',source_path,
    'source_kind',source_kind,'source_note',source_note,'signature',evidence_signature)
    INTO :new_record
  FROM __DB__.__SCHEMA__.MASTER_DECISION WHERE product_slug=:p_product AND attr_key=:p_attr;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,'master',:p_attr,:p_action,:old_record,:new_record,CURRENT_USER();
  COMMIT;
  RETURN '保存しました。';
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.DECIDE_FORM(
  p_product STRING,p_form STRING,p_field STRING,p_revision NUMBER,
  p_template_signature STRING,p_attr STRING,p_master_revision NUMBER,
  p_value STRING,p_source_path STRING,p_source_version STRING,p_note STRING,p_action STRING)
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  affected NUMBER;
  chosen_value STRING;
  chosen_version STRING;
  current_template STRING;
  old_record VARIANT;
  new_record VARIANT;
BEGIN
  IF (p_action IS NULL OR p_action NOT IN ('confirm','reopen') OR __DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN 'エラー: 操作と確認内容を確認してください。';
  END IF;
  BEGIN TRANSACTION;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION SET revision=revision+1
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field AND revision=:p_revision;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 他の操作で更新されました。再読み込みしてください。';
  END IF;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision-1,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note),current_template_signature
    INTO :old_record,:current_template
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  IF (NOT EQUAL_NULL(current_template,p_template_signature)) THEN
    ROLLBACK;
    RETURN 'エラー: 様式定義が更新されました。';
  END IF;
  IF (p_action='confirm' AND p_attr IS NOT NULL) THEN
    SELECT MAX(value),COUNT(*) INTO :chosen_value,:affected FROM __DB__.__SCHEMA__.MASTER_REVIEW_V
    WHERE product_slug=:p_product AND attr_key=:p_attr AND status='confirmed' AND revision=:p_master_revision;
    IF (affected<>1 OR chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: マスターが未確定、または更新されました。';
    END IF;
  ELSEIF (p_action='confirm') THEN
    chosen_value := __DB__.__SCHEMA__.TEXT_VALUE(:p_value);
    IF (chosen_value IS NULL OR p_source_path IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 値と根拠文書を指定してください。';
    END IF;
    SELECT version_key INTO :chosen_version FROM __DB__.__SCHEMA__.DOCUMENT_V
    WHERE product_slug=:p_product AND stage_path=:p_source_path AND is_current;
    IF (chosen_version IS NULL OR NOT EQUAL_NULL(chosen_version,p_source_version)) THEN
      ROLLBACK;
      RETURN 'エラー: 根拠文書が更新または削除されました。';
    END IF;
  END IF;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION
  SET value=:chosen_value,decision_state=IFF(:p_action='confirm','confirmed','pending'),
      selected_attr=IFF(:p_action='confirm',:p_attr,NULL),
      master_revision=IFF(:p_action='confirm' AND :p_attr IS NOT NULL,:p_master_revision,NULL),
      source_path=IFF(:p_action='confirm' AND :p_attr IS NULL,:p_source_path,NULL),
      source_version=:chosen_version,source_note=:p_note,template_signature=:current_template,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note)
    INTO :new_record
  FROM __DB__.__SCHEMA__.FORM_DECISION WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,:p_form,:p_field,:p_action,:old_record,:new_record,CURRENT_USER();
  COMMIT;
  RETURN '保存しました。';
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.EXPORT_HISTORY (
  export_id STRING NOT NULL,product_slug STRING NOT NULL,form_id STRING NOT NULL,
  export_kind STRING NOT NULL,rows_snapshot VARIANT NOT NULL,
  created_by STRING NOT NULL,created_at TIMESTAMP_LTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.PREPARE_EXPORT(p_product STRING,p_form STRING)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  payload VARIANT;
  export_id STRING;
BEGIN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL('field_key',field_key,'label',field_label,
    'section',section,'value',output_value,'status',status,'required',required,
    'source_path',source_path,'source_note',source_note,'master_attr',selected_attr,
    'master_revision',master_revision,'revision',revision,'decided_by',decided_by))
    WITHIN GROUP (ORDER BY display_order,field_key) INTO :payload
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE product_slug=:p_product AND form_id=:p_form;
  IF (ARRAY_SIZE(payload)=0) THEN RETURN OBJECT_CONSTRUCT('error','対象様式がありません。'); END IF;
  export_id := UUID_STRING();
  INSERT INTO __DB__.__SCHEMA__.EXPORT_HISTORY(export_id,product_slug,form_id,export_kind,rows_snapshot,created_by)
  SELECT :export_id,:p_product,:p_form,'review_only',:payload,CURRENT_USER();
  RETURN OBJECT_CONSTRUCT('export_id',export_id,'rows',payload,'kind','review_only');
END;
$$;
USE SCHEMA __DB__.__SCHEMA__;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.MASTER_REVIEW_V AS
SELECT decision.*, definition.attr_label, definition.section, definition.display_order,
       COALESCE(evidence.signature, SHA2('',256)) AS current_signature,
       COALESCE(evidence.n_candidates,0) AS n_candidates,
       COALESCE(evidence.n_values,0) AS n_values,
       COALESCE(evidence.n_documents,0) AS n_documents,
       CASE
         WHEN decision.decision_state IN ('confirmed','test_confirmed','rejected')
          AND NOT EQUAL_NULL(decision.evidence_signature,COALESCE(evidence.signature,SHA2('',256))) THEN 'changed'
         WHEN decision.decision_state IN ('confirmed','test_confirmed','rejected') THEN decision.decision_state
         WHEN COALESCE(evidence.n_candidates,0)=0 THEN 'missing'
         ELSE 'review'
       END AS status
FROM __DB__.__SCHEMA__.MASTER_DECISION decision
JOIN __DB__.__SCHEMA__.ATTR_DEF definition ON definition.attr_key=decision.attr_key
LEFT JOIN __DB__.__SCHEMA__.EVIDENCE_V evidence ON evidence.product_slug=decision.product_slug AND evidence.attr_key=decision.attr_key;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.FORM_REVIEW_V AS
WITH resolved AS (
  SELECT decision.*, field.field_label, field.section, field.display_order,
         field.guidance, field.required, field.suggested_attr,
         field.template_signature AS current_template_signature,
         master.status AS linked_master_status, master.revision AS current_master_revision,
         document.version_key AS current_source_version, document.is_current AS source_is_current,
         CASE
           WHEN decision.decision_state NOT IN ('confirmed','test_confirmed') THEN 'pending'
           WHEN NOT EQUAL_NULL(decision.template_signature,field.template_signature) THEN 'changed'
           WHEN decision.selected_attr IS NOT NULL AND
             ((COALESCE(master.status,'missing') <> 'confirmed'
               AND NOT (decision.decision_state='test_confirmed' AND COALESCE(master.status,'missing')='test_confirmed'))
              OR NOT EQUAL_NULL(decision.master_revision,master.revision)) THEN 'changed'
           WHEN decision.source_path IS NOT NULL AND
             (NOT COALESCE(document.is_current,FALSE)
              OR NOT EQUAL_NULL(decision.source_version,document.version_key)) THEN 'changed'
           ELSE decision.decision_state
         END AS status
  FROM __DB__.__SCHEMA__.FORM_DECISION decision
  JOIN __DB__.__SCHEMA__.FORM_FIELD_V field ON field.form_id=decision.form_id AND field.field_key=decision.field_key
  LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master ON master.product_slug=decision.product_slug AND master.attr_key=decision.selected_attr
  LEFT JOIN __DB__.__SCHEMA__.DOCUMENT_V document ON document.stage_path=decision.source_path
)
SELECT resolved.*, IFF(status='confirmed',value,NULL) AS output_value FROM resolved;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_BATCH_PREVIEW_V AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature) AS old_record
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), reset_items AS (
  SELECT product_slug,'master' AS scope_id,attr_key AS field_key,attr_label AS label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256) AS signature,
         value,candidate_id,source_path,source_label,source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'candidate_id',candidate_id,'source_path',source_path,'source_kind',source_kind,
           'source_note',source_note,'signature',evidence_signature) AS old_record
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE decision_state='test_confirmed'
  UNION ALL
  SELECT product_slug,form_id,field_key,field_label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256),value,
         NULL,source_path,NULL,NULL,selected_attr,master_revision,template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
           'source_version',source_version,'note',source_note,'template_signature',template_signature)
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE decision_state='test_confirmed'
)
SELECT 'apply' AS action,master_candidates.* FROM master_candidates
UNION ALL
SELECT 'apply',form_candidates.* FROM form_candidates
UNION ALL
SELECT 'reset',reset_items.* FROM reset_items;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.APPLY_TEST_BATCH(
  p_product STRING,p_scope STRING,p_action STRING,p_items_json STRING)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  requested VARIANT;
  matched VARIANT;
  requested_count NUMBER;
  distinct_count NUMBER;
  master_count NUMBER;
  form_count NUMBER;
  affected NUMBER;
  invalid_count NUMBER;
  batch_id STRING;
  batch_note STRING;
BEGIN
  requested := TRY_PARSE_JSON(:p_items_json);
  IF (p_product IS NULL OR p_scope IS NULL OR p_action IS NULL
      OR p_action NOT IN ('apply','reset') OR (p_action='apply' AND p_scope='all')
      OR NOT COALESCE(IS_ARRAY(requested),FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','対象と操作を確認してください。');
  END IF;
  requested_count := ARRAY_SIZE(requested);
  IF (requested_count < 1 OR requested_count > 500) THEN
    RETURN OBJECT_CONSTRUCT('error','対象は1〜500件で指定してください。');
  END IF;
  SELECT COUNT(DISTINCT TO_JSON(ARRAY_CONSTRUCT(item.value:scope_id,item.value:field_key)))
    INTO :distinct_count FROM TABLE(FLATTEN(input=>:requested)) item;
  IF (distinct_count <> requested_count) THEN
    RETURN OBJECT_CONSTRUCT('error','対象項目が重複しています。');
  END IF;
  batch_id := UUID_STRING();
  batch_note := IFF(p_action='apply','テスト一括確定（内容未確認・正式提出不可） / ',
    'テスト確定を解除（確認履歴は保持） / ') || batch_id;
  BEGIN TRANSACTION;
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record))
    INTO :matched
  FROM __DB__.__SCHEMA__.TEST_BATCH_PREVIEW_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product AND preview.action=:p_action
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  IF (ARRAY_SIZE(matched) <> requested_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','候補・確定状態・根拠が変わりました。一覧を再作成してください。');
  END IF;
  SELECT COALESCE(COUNT_IF(item.value:scope_id::STRING='master'),0),
         COALESCE(COUNT_IF(item.value:scope_id::STRING<>'master'),0)
    INTO :master_count,:form_count FROM TABLE(FLATTEN(input=>:matched)) item;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION decision
  SET revision=decision.revision+1,
      decision_state=IFF(:p_action='apply','test_confirmed','pending'),
      value=IFF(:p_action='apply',item.value:value::STRING,NULL),
      candidate_id=IFF(:p_action='apply',item.value:candidate_id::STRING,NULL),
      source_path=IFF(:p_action='apply',item.value:source_path::STRING,NULL),
      source_label=IFF(:p_action='apply',item.value:source_label::STRING,NULL),
      source_kind=IFF(:p_action='apply',item.value:source_kind::STRING,NULL),
      evidence_signature=IFF(:p_action='apply',item.value:signature::STRING,NULL),
      source_note=:batch_note,decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND item.value:scope_id::STRING='master'
    AND decision.attr_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=IFF(:p_action='apply','pending','test_confirmed');
  affected := SQLROWCOUNT;
  IF (affected <> master_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','マスターが他の操作で更新されました。全件取り消しました。');
  END IF;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION decision
  SET revision=decision.revision+1,
      decision_state=IFF(:p_action='apply','test_confirmed','pending'),
      value=IFF(:p_action='apply',item.value:value::STRING,NULL),
      selected_attr=IFF(:p_action='apply',item.value:selected_attr::STRING,NULL),
      master_revision=IFF(:p_action='apply',item.value:master_revision::NUMBER,NULL),
      template_signature=IFF(:p_action='apply',item.value:template_signature::STRING,NULL),
      source_path=NULL,source_version=NULL,source_note=:batch_note,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND decision.form_id=item.value:scope_id::STRING
    AND decision.field_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=IFF(:p_action='apply','pending','test_confirmed');
  affected := SQLROWCOUNT;
  IF (affected <> form_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','様式が他の操作で更新されました。全件取り消しました。');
  END IF;
  IF (p_action='apply') THEN
    SELECT COUNT(*) INTO :invalid_count FROM (
      SELECT 'master' AS scope_id,attr_key AS field_key,status FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE product_slug=:p_product
      UNION ALL
      SELECT form_id,field_key,status FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE product_slug=:p_product
    ) reviewed JOIN TABLE(FLATTEN(input=>:matched)) item
      ON reviewed.scope_id=item.value:scope_id::STRING AND reviewed.field_key=item.value:field_key::STRING
    WHERE reviewed.status<>'test_confirmed';
    IF (invalid_count<>0) THEN
      ROLLBACK;
      RETURN OBJECT_CONSTRUCT('error','処理中に根拠が変わりました。全件取り消しました。');
    END IF;
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,'master',decision.attr_key,'test_'||:p_action,item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'candidate_id',decision.candidate_id,'source_path',decision.source_path,
      'source_kind',decision.source_kind,'source_note',decision.source_note,
      'signature',decision.evidence_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.MASTER_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON item.value:scope_id::STRING='master' AND decision.attr_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,decision.form_id,decision.field_key,'test_'||:p_action,item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'attr',decision.selected_attr,'master_revision',decision.master_revision,
      'source_path',decision.source_path,'source_version',decision.source_version,
      'note',decision.source_note,'template_signature',decision.template_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON decision.form_id=item.value:scope_id::STRING AND decision.field_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('batch_id',batch_id,'master_count',master_count,'form_count',form_count,'action',p_action);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.PREPARE_TEST_EXPORT(p_product STRING,p_form STRING)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  payload VARIANT;
  export_id STRING;
BEGIN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL('field_key',field_key,'label',field_label,
    'section',section,'value',IFF(status IN ('confirmed','test_confirmed'),value,NULL),
    'status',status,'required',required,'source_path',source_path,'source_note',source_note,
    'master_attr',selected_attr,'master_revision',master_revision,'revision',revision,'decided_by',decided_by))
    WITHIN GROUP (ORDER BY display_order,field_key) INTO :payload
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE product_slug=:p_product AND form_id=:p_form;
  IF (ARRAY_SIZE(payload)=0) THEN RETURN OBJECT_CONSTRUCT('error','対象様式がありません。'); END IF;
  export_id := UUID_STRING();
  INSERT INTO __DB__.__SCHEMA__.EXPORT_HISTORY(export_id,product_slug,form_id,export_kind,rows_snapshot,created_by)
  SELECT :export_id,:p_product,:p_form,'test_only',:payload,CURRENT_USER();
  RETURN OBJECT_CONSTRUCT('export_id',export_id,'rows',payload,'kind','test_only');
END;
$$;
USE SCHEMA __DB__.__SCHEMA__;

ALTER TABLE __DB__.__SCHEMA__.FORM_DECISION ADD COLUMN IF NOT EXISTS master_signature STRING;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.MASTER_REVIEW_V AS
WITH input_health AS (
  SELECT product_slug,COUNT(*) AS stale_inputs FROM __DB__.__SCHEMA__.DOCUMENT_V
  WHERE doc_role='input' AND NOT is_current GROUP BY product_slug
)
SELECT decision.*,definition.attr_label,definition.section,definition.display_order,
       COALESCE(evidence.signature,SHA2('',256)) AS current_signature,
       COALESCE(evidence.n_candidates,0) AS n_candidates,
       COALESCE(evidence.n_values,0) AS n_values,
       COALESCE(evidence.n_documents,0) AS n_documents,
       CASE
         WHEN decision.decision_state='test_skipped' AND COALESCE(health.stale_inputs,0)>0 THEN 'changed'
         WHEN decision.decision_state IN ('confirmed','test_confirmed','test_skipped','rejected')
          AND NOT EQUAL_NULL(decision.evidence_signature,COALESCE(evidence.signature,SHA2('',256))) THEN 'changed'
         WHEN decision.decision_state IN ('confirmed','test_confirmed','test_skipped','rejected') THEN decision.decision_state
         WHEN COALESCE(evidence.n_candidates,0)=0 THEN 'missing'
         ELSE 'review'
       END AS status
FROM __DB__.__SCHEMA__.MASTER_DECISION decision
JOIN __DB__.__SCHEMA__.ATTR_DEF definition ON definition.attr_key=decision.attr_key
LEFT JOIN input_health health ON health.product_slug=decision.product_slug
LEFT JOIN __DB__.__SCHEMA__.EVIDENCE_V evidence ON evidence.product_slug=decision.product_slug AND evidence.attr_key=decision.attr_key;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.FORM_REVIEW_V AS
WITH input_health AS (
  SELECT product_slug,COUNT(*) AS stale_inputs FROM __DB__.__SCHEMA__.DOCUMENT_V
  WHERE doc_role='input' AND NOT is_current GROUP BY product_slug
), resolved AS (
  SELECT decision.*,field.field_label,field.section,field.display_order,
         field.guidance,field.required,field.suggested_attr,
         field.template_signature AS current_template_signature,
         master.status AS linked_master_status,master.revision AS current_master_revision,
         document.version_key AS current_source_version,document.is_current AS source_is_current,
         CASE
           WHEN decision.decision_state NOT IN ('confirmed','test_confirmed','test_skipped') THEN 'pending'
           WHEN NOT EQUAL_NULL(decision.template_signature,field.template_signature) THEN 'changed'
           WHEN decision.decision_state='test_skipped' AND COALESCE(health.stale_inputs,0)>0 THEN 'changed'
           WHEN decision.decision_state='test_skipped' AND decision.selected_attr IS NOT NULL AND
             (COALESCE(master.status,'absent') NOT IN ('missing','test_skipped')
              OR NOT EQUAL_NULL(decision.master_revision,master.revision)
              OR NOT EQUAL_NULL(decision.master_signature,master.current_signature)) THEN 'changed'
           WHEN decision.decision_state<>'test_skipped' AND decision.selected_attr IS NOT NULL AND
             ((COALESCE(master.status,'missing') <> 'confirmed'
               AND NOT (decision.decision_state='test_confirmed' AND COALESCE(master.status,'missing')='test_confirmed'))
              OR NOT EQUAL_NULL(decision.master_revision,master.revision)) THEN 'changed'
           WHEN decision.source_path IS NOT NULL AND
             (NOT COALESCE(document.is_current,FALSE)
              OR NOT EQUAL_NULL(decision.source_version,document.version_key)) THEN 'changed'
           ELSE decision.decision_state
         END AS status
  FROM __DB__.__SCHEMA__.FORM_DECISION decision
  JOIN __DB__.__SCHEMA__.FORM_FIELD_V field ON field.form_id=decision.form_id AND field.field_key=decision.field_key
  LEFT JOIN input_health health ON health.product_slug=decision.product_slug
  LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master ON master.product_slug=decision.product_slug AND master.attr_key=decision.selected_attr
  LEFT JOIN __DB__.__SCHEMA__.DOCUMENT_V document ON document.stage_path=decision.source_path
)
SELECT resolved.*,IFF(status='confirmed',value,NULL) AS output_value FROM resolved;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_BATCH_PREVIEW_V AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature,
           'master_signature',field.master_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), master_skips AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（候補なし）' AS source_label,'test_skip' AS source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,'source_path',master.source_path,
           'source_kind',master.source_kind,'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_skipped' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  WHERE master.decision_state='pending' AND master.n_candidates=0 AND master.value IS NULL
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=master.product_slug AND document.doc_role='input' AND NOT document.is_current)
), form_skips AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT('test_skipped',field.current_template_signature,
           master.attr_key,master.revision,master.current_signature,master.status)),256) AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（転記値なし・対応未登録）' AS source_label,'test_skip' AS source_kind,
         master.attr_key AS selected_attr,master.revision AS master_revision,
         field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,'note',field.source_note,
           'template_signature',field.template_signature,'master_signature',field.master_signature) AS old_record,
         'test_skipped' AS target_state,master.current_signature AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND field.value IS NULL
    AND (field.suggested_attr IS NULL OR (master.status IN ('missing','test_skipped')
      AND master.n_candidates=0 AND master.value IS NULL))
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=field.product_slug AND document.doc_role='input' AND NOT document.is_current)
), reset_items AS (
  SELECT product_slug,'master' AS scope_id,attr_key AS field_key,attr_label AS label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256) AS signature,
         value,candidate_id,source_path,source_label,source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'candidate_id',candidate_id,'source_path',source_path,'source_kind',source_kind,
           'source_note',source_note,'signature',evidence_signature) AS old_record,
         'pending' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE decision_state IN ('test_confirmed','test_skipped')
  UNION ALL
  SELECT product_slug,form_id,field_key,field_label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256),value,
         NULL,source_path,NULL,NULL,selected_attr,master_revision,template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
           'source_version',source_version,'note',source_note,'template_signature',template_signature,
           'master_signature',master_signature),'pending',master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE decision_state IN ('test_confirmed','test_skipped')
), candidates AS (
  SELECT * FROM master_candidates UNION ALL SELECT * FROM form_candidates
)
SELECT 'apply' AS action,candidates.* FROM candidates
UNION ALL
SELECT 'apply_with_skips',candidates.* FROM candidates
UNION ALL
SELECT 'apply_with_skips',master_skips.* FROM master_skips
UNION ALL
SELECT 'apply_with_skips',form_skips.* FROM form_skips
UNION ALL
SELECT 'reset',reset_items.* FROM reset_items;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.APPLY_TEST_BATCH(
  p_product STRING,p_scope STRING,p_action STRING,p_items_json STRING)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  requested VARIANT;
  matched VARIANT;
  requested_count NUMBER;
  distinct_count NUMBER;
  master_count NUMBER;
  form_count NUMBER;
  skipped_count NUMBER;
  affected NUMBER;
  invalid_count NUMBER;
  batch_id STRING;
  batch_note STRING;
BEGIN
  requested := TRY_PARSE_JSON(:p_items_json);
  IF (p_product IS NULL OR p_scope IS NULL OR p_action IS NULL
      OR p_action NOT IN ('apply','apply_with_skips','reset') OR (p_action<>'reset' AND p_scope='all')
      OR NOT COALESCE(IS_ARRAY(requested),FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','対象と操作を確認してください。');
  END IF;
  requested_count := ARRAY_SIZE(requested);
  IF (requested_count < 1 OR requested_count > 500) THEN
    RETURN OBJECT_CONSTRUCT('error','対象は1〜500件で指定してください。');
  END IF;
  SELECT COUNT(DISTINCT TO_JSON(ARRAY_CONSTRUCT(item.value:scope_id,item.value:field_key)))
    INTO :distinct_count FROM TABLE(FLATTEN(input=>:requested)) item;
  IF (distinct_count <> requested_count) THEN
    RETURN OBJECT_CONSTRUCT('error','対象項目が重複しています。');
  END IF;
  batch_id := UUID_STRING();
  batch_note := IFF(p_action='reset','テスト確定・入力省略を解除（履歴は保持） / ',
    'テスト一括処理（内容未確認・正式提出不可） / ') || batch_id;
  BEGIN TRANSACTION;
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_BATCH_PREVIEW_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product AND preview.action=:p_action
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  IF (ARRAY_SIZE(matched) <> requested_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','候補・確定状態・根拠が変わりました。一覧を再作成してください。');
  END IF;
  SELECT COALESCE(COUNT_IF(item.value:scope_id::STRING='master'),0),
         COALESCE(COUNT_IF(item.value:scope_id::STRING<>'master'),0),
         COALESCE(COUNT_IF(item.value:target_state::STRING='test_skipped'),0)
    INTO :master_count,:form_count,:skipped_count FROM TABLE(FLATTEN(input=>:matched)) item;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION decision
  SET revision=decision.revision+1,decision_state=item.value:target_state::STRING,
      value=IFF(item.value:target_state::STRING='test_confirmed',item.value:value::STRING,NULL),
      candidate_id=IFF(:p_action<>'reset',item.value:candidate_id::STRING,NULL),
      source_path=IFF(:p_action<>'reset',item.value:source_path::STRING,NULL),
      source_label=IFF(:p_action<>'reset',item.value:source_label::STRING,NULL),
      source_kind=IFF(:p_action<>'reset',item.value:source_kind::STRING,NULL),
      evidence_signature=IFF(:p_action<>'reset',item.value:signature::STRING,NULL),
      source_note=IFF(item.value:target_state::STRING='test_skipped','テスト入力省略（値未提供） / ','')||:batch_note,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND item.value:scope_id::STRING='master'
    AND decision.attr_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=item.value:old_record:state::STRING;
  affected := SQLROWCOUNT;
  IF (affected <> master_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','マスターが他の操作で更新されました。全件取り消しました。');
  END IF;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION decision
  SET revision=decision.revision+1,decision_state=item.value:target_state::STRING,
      value=IFF(item.value:target_state::STRING='test_confirmed',item.value:value::STRING,NULL),
      selected_attr=IFF(:p_action<>'reset',item.value:selected_attr::STRING,NULL),
      master_revision=IFF(:p_action<>'reset',item.value:master_revision::NUMBER,NULL),
      template_signature=IFF(:p_action<>'reset',item.value:template_signature::STRING,NULL),
      master_signature=IFF(:p_action<>'reset',item.value:master_signature::STRING,NULL),
      source_path=NULL,source_version=NULL,
      source_note=IFF(item.value:target_state::STRING='test_skipped','テスト入力省略（値未提供） / ','')||:batch_note,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND decision.form_id=item.value:scope_id::STRING
    AND decision.field_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=item.value:old_record:state::STRING;
  affected := SQLROWCOUNT;
  IF (affected <> form_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','様式が他の操作で更新されました。全件取り消しました。');
  END IF;
  IF (p_action<>'reset') THEN
    SELECT COUNT(*) INTO :invalid_count FROM (
      SELECT 'master' AS scope_id,attr_key AS field_key,status FROM __DB__.__SCHEMA__.MASTER_REVIEW_V WHERE product_slug=:p_product
      UNION ALL
      SELECT form_id,field_key,status FROM __DB__.__SCHEMA__.FORM_REVIEW_V WHERE product_slug=:p_product
    ) reviewed JOIN TABLE(FLATTEN(input=>:matched)) item
      ON reviewed.scope_id=item.value:scope_id::STRING AND reviewed.field_key=item.value:field_key::STRING
    WHERE reviewed.status<>item.value:target_state::STRING;
    IF (invalid_count<>0) THEN
      ROLLBACK;
      RETURN OBJECT_CONSTRUCT('error','処理中に根拠が変わりました。全件取り消しました。');
    END IF;
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,'master',decision.attr_key,
    IFF(:p_action='reset','test_reset',IFF(decision.decision_state='test_skipped','test_skip','test_apply')),item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'candidate_id',decision.candidate_id,'source_path',decision.source_path,
      'source_kind',decision.source_kind,'source_note',decision.source_note,
      'signature',decision.evidence_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.MASTER_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON item.value:scope_id::STRING='master' AND decision.attr_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,decision.form_id,decision.field_key,
    IFF(:p_action='reset','test_reset',IFF(decision.decision_state='test_skipped','test_skip','test_apply')),item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'attr',decision.selected_attr,'master_revision',decision.master_revision,
      'source_path',decision.source_path,'source_version',decision.source_version,'note',decision.source_note,
      'template_signature',decision.template_signature,'master_signature',decision.master_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON decision.form_id=item.value:scope_id::STRING AND decision.field_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('batch_id',batch_id,'master_count',master_count,'form_count',form_count,
    'skipped_count',skipped_count,'action',p_action);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_MASTER_APPLY_V COPY GRANTS AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature,
           'master_signature',field.master_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), master_skips AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（候補なし）' AS source_label,'test_skip' AS source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,'source_path',master.source_path,
           'source_kind',master.source_kind,'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_skipped' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  WHERE master.decision_state='pending' AND master.n_candidates=0 AND master.value IS NULL
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=master.product_slug AND document.doc_role='input' AND NOT document.is_current)
), form_skips AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT('test_skipped',field.current_template_signature,
           master.attr_key,master.revision,master.current_signature,master.status)),256) AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（転記値なし・対応未登録）' AS source_label,'test_skip' AS source_kind,
         master.attr_key AS selected_attr,master.revision AS master_revision,
         field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,'note',field.source_note,
           'template_signature',field.template_signature,'master_signature',field.master_signature) AS old_record,
         'test_skipped' AS target_state,master.current_signature AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND field.value IS NULL
    AND (field.suggested_attr IS NULL OR (master.status IN ('missing','test_skipped')
      AND master.n_candidates=0 AND master.value IS NULL))
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=field.product_slug AND document.doc_role='input' AND NOT document.is_current)
)
SELECT * FROM master_candidates;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_MASTER_SKIPS_V COPY GRANTS AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature,
           'master_signature',field.master_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), master_skips AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（候補なし）' AS source_label,'test_skip' AS source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,'source_path',master.source_path,
           'source_kind',master.source_kind,'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_skipped' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  WHERE master.decision_state='pending' AND master.n_candidates=0 AND master.value IS NULL
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=master.product_slug AND document.doc_role='input' AND NOT document.is_current)
), form_skips AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT('test_skipped',field.current_template_signature,
           master.attr_key,master.revision,master.current_signature,master.status)),256) AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（転記値なし・対応未登録）' AS source_label,'test_skip' AS source_kind,
         master.attr_key AS selected_attr,master.revision AS master_revision,
         field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,'note',field.source_note,
           'template_signature',field.template_signature,'master_signature',field.master_signature) AS old_record,
         'test_skipped' AS target_state,master.current_signature AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND field.value IS NULL
    AND (field.suggested_attr IS NULL OR (master.status IN ('missing','test_skipped')
      AND master.n_candidates=0 AND master.value IS NULL))
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=field.product_slug AND document.doc_role='input' AND NOT document.is_current)
)
SELECT * FROM master_candidates UNION ALL SELECT * FROM master_skips;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_FORM_APPLY_V COPY GRANTS AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature,
           'master_signature',field.master_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), master_skips AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（候補なし）' AS source_label,'test_skip' AS source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,'source_path',master.source_path,
           'source_kind',master.source_kind,'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_skipped' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  WHERE master.decision_state='pending' AND master.n_candidates=0 AND master.value IS NULL
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=master.product_slug AND document.doc_role='input' AND NOT document.is_current)
), form_skips AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT('test_skipped',field.current_template_signature,
           master.attr_key,master.revision,master.current_signature,master.status)),256) AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（転記値なし・対応未登録）' AS source_label,'test_skip' AS source_kind,
         master.attr_key AS selected_attr,master.revision AS master_revision,
         field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,'note',field.source_note,
           'template_signature',field.template_signature,'master_signature',field.master_signature) AS old_record,
         'test_skipped' AS target_state,master.current_signature AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND field.value IS NULL
    AND (field.suggested_attr IS NULL OR (master.status IN ('missing','test_skipped')
      AND master.n_candidates=0 AND master.value IS NULL))
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=field.product_slug AND document.doc_role='input' AND NOT document.is_current)
)
SELECT * FROM form_candidates;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_FORM_SKIPS_V COPY GRANTS AS
WITH master_candidates AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         candidate.raw_value AS value,candidate.candidate_id,candidate.source_path,
         candidate.source_label,candidate.source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,
         NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,
           'source_path',master.source_path,'source_kind',master.source_kind,
           'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate ON candidate.product_slug=master.product_slug AND candidate.attr_key=master.attr_key
  WHERE master.decision_state='pending' AND master.n_values=1
    AND NOT EXISTS (
      SELECT 1 FROM __DB__.__SCHEMA__.CANDIDATE_V flagged JOIN __DB__.__SCHEMA__.SOURCE_REVIEW_NOTE note
        ON note.stage_path=flagged.source_path AND note.attr_key=flagged.attr_key
       AND note.raw_value=flagged.raw_value AND note.version_key=flagged.version_key
      WHERE flagged.product_slug=master.product_slug AND flagged.attr_key=master.attr_key)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY master.product_slug,master.attr_key
    ORDER BY candidate.is_primary DESC,candidate.source_path NULLS LAST,candidate.candidate_id)=1
), form_candidates AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(field.current_template_signature,master.attr_key,
           master.revision,master.current_signature,master.status)),256) AS signature,
         master.value,NULL::STRING AS candidate_id,master.source_path,
         master.source_label,master.source_kind,master.attr_key AS selected_attr,
         master.revision AS master_revision,field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,
           'note',field.source_note,'template_signature',field.template_signature,
           'master_signature',field.master_signature) AS old_record,
         'test_confirmed' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND master.status IN ('confirmed','test_confirmed')
), master_skips AS (
  SELECT master.product_slug,'master' AS scope_id,master.attr_key AS field_key,
         master.attr_label AS label,master.revision,master.current_signature AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（候補なし）' AS source_label,'test_skip' AS source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',master.value,'state',master.decision_state,
           'revision',master.revision,'candidate_id',master.candidate_id,'source_path',master.source_path,
           'source_kind',master.source_kind,'source_note',master.source_note,'signature',master.evidence_signature) AS old_record,
         'test_skipped' AS target_state,NULL::STRING AS master_signature
  FROM __DB__.__SCHEMA__.MASTER_REVIEW_V master
  WHERE master.decision_state='pending' AND master.n_candidates=0 AND master.value IS NULL
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=master.product_slug AND document.doc_role='input' AND NOT document.is_current)
), form_skips AS (
  SELECT field.product_slug,field.form_id AS scope_id,field.field_key,
         field.field_label AS label,field.revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT('test_skipped',field.current_template_signature,
           master.attr_key,master.revision,master.current_signature,master.status)),256) AS signature,
         NULL::STRING AS value,NULL::STRING AS candidate_id,NULL::STRING AS source_path,
         'テスト入力省略（転記値なし・対応未登録）' AS source_label,'test_skip' AS source_kind,
         master.attr_key AS selected_attr,master.revision AS master_revision,
         field.current_template_signature AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',field.value,'state',field.decision_state,
           'revision',field.revision,'attr',field.selected_attr,'master_revision',field.master_revision,
           'source_path',field.source_path,'source_version',field.source_version,'note',field.source_note,
           'template_signature',field.template_signature,'master_signature',field.master_signature) AS old_record,
         'test_skipped' AS target_state,master.current_signature AS master_signature
  FROM __DB__.__SCHEMA__.FORM_REVIEW_V field LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug=field.product_slug AND master.attr_key=field.suggested_attr
  WHERE field.decision_state='pending' AND field.value IS NULL
    AND (field.suggested_attr IS NULL OR (master.status IN ('missing','test_skipped')
      AND master.n_candidates=0 AND master.value IS NULL))
    AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V document
      WHERE document.product_slug=field.product_slug AND document.doc_role='input' AND NOT document.is_current)
)
SELECT * FROM form_candidates UNION ALL SELECT * FROM form_skips;
CREATE OR REPLACE VIEW __DB__.__SCHEMA__.TEST_RESET_PREVIEW_V COPY GRANTS AS
  SELECT product_slug,'master' AS scope_id,attr_key AS field_key,attr_label AS label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256) AS signature,
         value,candidate_id,source_path,source_label,source_kind,
         NULL::STRING AS selected_attr,NULL::NUMBER AS master_revision,NULL::STRING AS template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'candidate_id',candidate_id,'source_path',source_path,'source_kind',source_kind,
           'source_note',source_note,'signature',evidence_signature) AS old_record,
         'pending' AS target_state,NULL::STRING AS master_signature
  FROM (SELECT decision.*,definition.attr_label FROM __DB__.__SCHEMA__.MASTER_DECISION decision JOIN __DB__.__SCHEMA__.ATTR_DEF definition ON definition.attr_key=decision.attr_key) WHERE decision_state IN ('test_confirmed','test_skipped')
  UNION ALL
  SELECT product_slug,form_id,field_key,field_label,revision,
         SHA2(TO_JSON(ARRAY_CONSTRUCT(revision,decision_state)),256),value,
         NULL,source_path,NULL,NULL,selected_attr,master_revision,template_signature,
         OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
           'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
           'source_version',source_version,'note',source_note,'template_signature',template_signature,
           'master_signature',master_signature),'pending',master_signature
  FROM (SELECT decision.*,field.field_label FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN __DB__.__SCHEMA__.FORM_FIELD_V field ON field.form_id=decision.form_id AND field.field_key=decision.field_key) WHERE decision_state IN ('test_confirmed','test_skipped')
;
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.DECIDE_FORM(
  p_product STRING,p_form STRING,p_field STRING,p_revision NUMBER,
  p_template_signature STRING,p_attr STRING,p_master_revision NUMBER,
  p_value STRING,p_source_path STRING,p_source_version STRING,p_note STRING,p_action STRING)
COPY GRANTS
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  affected NUMBER;
  chosen_value STRING;
  chosen_version STRING;
  current_template STRING;
  old_record VARIANT;
  new_record VARIANT;
BEGIN
  IF (p_action IS NULL OR p_action NOT IN ('confirm','reopen') OR __DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN 'エラー: 操作と確認内容を確認してください。';
  END IF;
  BEGIN TRANSACTION;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION SET revision=revision+1
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field AND revision=:p_revision;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 他の操作で更新されました。再読み込みしてください。';
  END IF;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision-1,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note),current_template_signature
    INTO :old_record,:current_template
  FROM (
    SELECT decision.*,field.template_signature AS current_template_signature
    FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN __DB__.__SCHEMA__.FORM_FIELD_V field
      ON field.form_id=decision.form_id AND field.field_key=decision.field_key
    WHERE decision.product_slug=:p_product AND decision.form_id=:p_form AND decision.field_key=:p_field
  );
  IF (NOT EQUAL_NULL(current_template,p_template_signature)) THEN
    ROLLBACK;
    RETURN 'エラー: 様式定義が更新されました。';
  END IF;
  IF (p_action='confirm' AND p_attr IS NOT NULL) THEN
    SELECT MAX(value),COUNT(*) INTO :chosen_value,:affected FROM __DB__.__SCHEMA__.MASTER_REVIEW_V
    WHERE product_slug=:p_product AND attr_key=:p_attr AND status='confirmed' AND revision=:p_master_revision;
    IF (affected<>1 OR chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: マスターが未確定、または更新されました。';
    END IF;
  ELSEIF (p_action='confirm') THEN
    chosen_value := __DB__.__SCHEMA__.TEXT_VALUE(:p_value);
    IF (chosen_value IS NULL OR p_source_path IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 値と根拠文書を指定してください。';
    END IF;
    SELECT version_key INTO :chosen_version FROM __DB__.__SCHEMA__.DOCUMENT_V
    WHERE product_slug=:p_product AND stage_path=:p_source_path AND is_current;
    IF (chosen_version IS NULL OR NOT EQUAL_NULL(chosen_version,p_source_version)) THEN
      ROLLBACK;
      RETURN 'エラー: 根拠文書が更新または削除されました。';
    END IF;
  END IF;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION
  SET value=:chosen_value,decision_state=IFF(:p_action='confirm','confirmed','pending'),
      selected_attr=IFF(:p_action='confirm',:p_attr,NULL),
      master_revision=IFF(:p_action='confirm' AND :p_attr IS NOT NULL,:p_master_revision,NULL),
      source_path=IFF(:p_action='confirm' AND :p_attr IS NULL,:p_source_path,NULL),
      source_version=:chosen_version,source_note=:p_note,template_signature=:current_template,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note)
    INTO :new_record
  FROM __DB__.__SCHEMA__.FORM_DECISION WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,:p_form,:p_field,:p_action,:old_record,:new_record,CURRENT_USER();
  COMMIT;
  RETURN '保存しました。';
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.APPLY_TEST_BATCH(
  p_product STRING,p_scope STRING,p_action STRING,p_items_json STRING)
COPY GRANTS
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  requested VARIANT;
  matched VARIANT;
  requested_count NUMBER;
  distinct_count NUMBER;
  master_count NUMBER;
  form_count NUMBER;
  skipped_count NUMBER;
  affected NUMBER;
  invalid_count NUMBER;
  batch_id STRING;
  batch_note STRING;
BEGIN
  requested := TRY_PARSE_JSON(:p_items_json);
  IF (p_product IS NULL OR p_scope IS NULL OR p_action IS NULL
      OR p_action NOT IN ('apply','apply_with_skips','reset') OR (p_action<>'reset' AND p_scope='all')
      OR NOT COALESCE(IS_ARRAY(requested),FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','対象と操作を確認してください。');
  END IF;
  requested_count := ARRAY_SIZE(requested);
  IF (requested_count < 1 OR requested_count > 500) THEN
    RETURN OBJECT_CONSTRUCT('error','対象は1〜500件で指定してください。');
  END IF;
  SELECT COUNT(DISTINCT TO_JSON(ARRAY_CONSTRUCT(item.value:scope_id,item.value:field_key)))
    INTO :distinct_count FROM TABLE(FLATTEN(input=>:requested)) item;
  IF (distinct_count <> requested_count) THEN
    RETURN OBJECT_CONSTRUCT('error','対象項目が重複しています。');
  END IF;
  batch_id := UUID_STRING();
  batch_note := IFF(p_action='reset','テスト確定・入力省略を解除（履歴は保持） / ',
    'テスト一括処理（内容未確認・正式提出不可） / ') || batch_id;
  BEGIN TRANSACTION;
  IF (p_action='reset') THEN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_RESET_PREVIEW_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  ELSEIF (p_scope='master' AND p_action='apply') THEN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_MASTER_APPLY_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  ELSEIF (p_scope='master' AND p_action='apply_with_skips') THEN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_MASTER_SKIPS_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  ELSEIF (p_action='apply') THEN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_FORM_APPLY_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  ELSEIF (p_action='apply_with_skips') THEN
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'scope_id',preview.scope_id,'field_key',preview.field_key,'revision',preview.revision,
    'signature',preview.signature,'value',preview.value,'candidate_id',preview.candidate_id,
    'source_path',preview.source_path,'source_label',preview.source_label,'source_kind',preview.source_kind,
    'selected_attr',preview.selected_attr,'master_revision',preview.master_revision,
    'template_signature',preview.template_signature,'old_record',preview.old_record,
    'target_state',preview.target_state,'master_signature',preview.master_signature)) INTO :matched
  FROM __DB__.__SCHEMA__.TEST_FORM_SKIPS_V preview JOIN TABLE(FLATTEN(input=>:requested)) item
    ON preview.scope_id=item.value:scope_id::STRING AND preview.field_key=item.value:field_key::STRING
   AND preview.revision=item.value:revision::NUMBER AND preview.signature=item.value:signature::STRING
   AND EQUAL_NULL(preview.candidate_id,item.value:candidate_id::STRING)
  WHERE preview.product_slug=:p_product
    AND (:p_scope='all' OR preview.scope_id=:p_scope);
  END IF;
  SELECT COUNT(DISTINCT TO_JSON(ARRAY_CONSTRUCT(item.value:scope_id,item.value:field_key)))
    INTO :distinct_count FROM TABLE(FLATTEN(input=>:matched)) item;
  IF (COALESCE(ARRAY_SIZE(matched),0) <> requested_count OR distinct_count<>requested_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','候補・確定状態・根拠が変わりました。一覧を再作成してください。');
  END IF;
  SELECT COALESCE(COUNT_IF(item.value:scope_id::STRING='master'),0),
         COALESCE(COUNT_IF(item.value:scope_id::STRING<>'master'),0),
         COALESCE(COUNT_IF(item.value:target_state::STRING='test_skipped'),0)
    INTO :master_count,:form_count,:skipped_count FROM TABLE(FLATTEN(input=>:matched)) item;
  IF (master_count>0) THEN
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION decision
  SET revision=decision.revision+1,decision_state=item.value:target_state::STRING,
      value=IFF(item.value:target_state::STRING='test_confirmed',item.value:value::STRING,NULL),
      candidate_id=IFF(:p_action<>'reset',item.value:candidate_id::STRING,NULL),
      source_path=IFF(:p_action<>'reset',item.value:source_path::STRING,NULL),
      source_label=IFF(:p_action<>'reset',item.value:source_label::STRING,NULL),
      source_kind=IFF(:p_action<>'reset',item.value:source_kind::STRING,NULL),
      evidence_signature=IFF(:p_action<>'reset',item.value:signature::STRING,NULL),
      source_note=IFF(item.value:target_state::STRING='test_skipped','テスト入力省略（値未提供） / ','')||:batch_note,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND item.value:scope_id::STRING='master'
    AND decision.attr_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=item.value:old_record:state::STRING;
  affected := SQLROWCOUNT;
  IF (affected <> master_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','マスターが他の操作で更新されました。全件取り消しました。');
  END IF;
  END IF;
  IF (form_count>0) THEN
  UPDATE __DB__.__SCHEMA__.FORM_DECISION decision
  SET revision=decision.revision+1,decision_state=item.value:target_state::STRING,
      value=IFF(item.value:target_state::STRING='test_confirmed',item.value:value::STRING,NULL),
      selected_attr=IFF(:p_action<>'reset',item.value:selected_attr::STRING,NULL),
      master_revision=IFF(:p_action<>'reset',item.value:master_revision::NUMBER,NULL),
      template_signature=IFF(:p_action<>'reset',item.value:template_signature::STRING,NULL),
      master_signature=IFF(:p_action<>'reset',item.value:master_signature::STRING,NULL),
      source_path=NULL,source_version=NULL,
      source_note=IFF(item.value:target_state::STRING='test_skipped','テスト入力省略（値未提供） / ','')||:batch_note,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  FROM TABLE(FLATTEN(input=>:matched)) item
  WHERE decision.product_slug=:p_product AND decision.form_id=item.value:scope_id::STRING
    AND decision.field_key=item.value:field_key::STRING AND decision.revision=item.value:revision::NUMBER
    AND decision.decision_state=item.value:old_record:state::STRING;
  affected := SQLROWCOUNT;
  IF (affected <> form_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','様式が他の操作で更新されました。全件取り消しました。');
  END IF;
  END IF;
  IF (p_action<>'reset') THEN
    SELECT COUNT(*) INTO :invalid_count FROM (
      SELECT item.index
      FROM TABLE(FLATTEN(input=>:matched)) item
      LEFT JOIN (
        SELECT 'master' AS scope_id,attr_key AS field_key,status FROM __DB__.__SCHEMA__.MASTER_REVIEW_V
        WHERE product_slug=:p_product AND :master_count>0
        UNION ALL
        SELECT form_id,field_key,status FROM __DB__.__SCHEMA__.FORM_REVIEW_V
        WHERE product_slug=:p_product AND :form_count>0 AND (:p_scope='all' OR form_id=:p_scope)
      ) reviewed ON reviewed.scope_id=item.value:scope_id::STRING
        AND reviewed.field_key=item.value:field_key::STRING
      GROUP BY item.index
      HAVING COUNT(reviewed.field_key)<>1
        OR COUNT_IF(EQUAL_NULL(reviewed.status,item.value:target_state::STRING))<>1
    );
    IF (invalid_count<>0) THEN
      ROLLBACK;
      RETURN OBJECT_CONSTRUCT('error','処理中に根拠が変わりました。全件取り消しました。');
    END IF;
  END IF;
  IF (master_count>0) THEN
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,'master',decision.attr_key,
    IFF(:p_action='reset','test_reset',IFF(decision.decision_state='test_skipped','test_skip','test_apply')),item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'candidate_id',decision.candidate_id,'source_path',decision.source_path,
      'source_kind',decision.source_kind,'source_note',decision.source_note,
      'signature',decision.evidence_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.MASTER_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON item.value:scope_id::STRING='master' AND decision.attr_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  affected := SQLROWCOUNT;
  IF (affected<>master_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','履歴件数が一致しません。全件取り消しました。');
  END IF;
  END IF;
  IF (form_count>0) THEN
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,decision.form_id,decision.field_key,
    IFF(:p_action='reset','test_reset',IFF(decision.decision_state='test_skipped','test_skip','test_apply')),item.value:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'attr',decision.selected_attr,'master_revision',decision.master_revision,
      'source_path',decision.source_path,'source_version',decision.source_version,'note',decision.source_note,
      'template_signature',decision.template_signature,'master_signature',decision.master_signature,'batch_id',:batch_id),CURRENT_USER()
  FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN TABLE(FLATTEN(input=>:matched)) item
    ON decision.form_id=item.value:scope_id::STRING AND decision.field_key=item.value:field_key::STRING
  WHERE decision.product_slug=:p_product;
  affected := SQLROWCOUNT;
  IF (affected<>form_count) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','履歴件数が一致しません。全件取り消しました。');
  END IF;
  END IF;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('batch_id',batch_id,'master_count',master_count,'form_count',form_count,
    'skipped_count',skipped_count,'action',p_action);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.DECIDE_MASTER(
  p_product STRING, p_attr STRING, p_revision NUMBER, p_signature STRING,
  p_action STRING, p_candidate STRING, p_value STRING, p_note STRING)
COPY GRANTS
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  event_id STRING DEFAULT UUID_STRING();
  old_record VARIANT;
  current_signature STRING;
  chosen_value STRING;
  chosen_path STRING;
  chosen_label STRING;
  chosen_kind STRING;
  affected NUMBER;
  candidate_count NUMBER;
BEGIN
  IF (p_action IS NULL OR p_action NOT IN ('approve','manual','reject','reopen')) THEN
    RETURN 'エラー: 不明な操作です。';
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN 'エラー: 確認内容・出所を記入してください。';
  END IF;
  BEGIN TRANSACTION;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION SET revision=revision+1
  WHERE product_slug=:p_product AND attr_key=:p_attr AND revision=:p_revision;
  affected := SQLROWCOUNT;
  IF (affected <> 1) THEN
    ROLLBACK;
    RETURN 'エラー: 他の操作で更新されました。再読み込みしてください。';
  END IF;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
    'revision',decision.revision-1,'candidate_id',decision.candidate_id,'source_path',decision.source_path,
    'source_kind',decision.source_kind,'source_note',decision.source_note,'signature',decision.evidence_signature),
    COALESCE(evidence.signature,SHA2('',256)),evidence.chosen_value,evidence.chosen_path,
    evidence.chosen_label,evidence.chosen_kind,COALESCE(evidence.candidate_count,0)
    INTO :old_record,:current_signature,:chosen_value,:chosen_path,:chosen_label,:chosen_kind,:candidate_count
  FROM __DB__.__SCHEMA__.MASTER_DECISION decision
  JOIN __DB__.__SCHEMA__.ATTR_DEF definition ON definition.attr_key=decision.attr_key
  CROSS JOIN (
    SELECT SHA2(LISTAGG(candidate_id,'|') WITHIN GROUP (ORDER BY candidate_id),256) AS signature,
      MAX(IFF(:p_action='approve' AND candidate_id=:p_candidate,raw_value,NULL)) AS chosen_value,
      MAX(IFF(:p_action='approve' AND candidate_id=:p_candidate,source_path,NULL)) AS chosen_path,
      MAX(IFF(:p_action='approve' AND candidate_id=:p_candidate,source_label,NULL)) AS chosen_label,
      MAX(IFF(:p_action='approve' AND candidate_id=:p_candidate,source_kind,NULL)) AS chosen_kind,
      COUNT_IF(candidate_id=:p_candidate) AS candidate_count
    FROM __DB__.__SCHEMA__.CANDIDATE_V WHERE product_slug=:p_product AND attr_key=:p_attr
  ) evidence
  WHERE decision.product_slug=:p_product AND decision.attr_key=:p_attr;
  IF (NOT EQUAL_NULL(current_signature,p_signature)) THEN
    ROLLBACK;
    RETURN 'エラー: 根拠文書が更新されました。再読み込みしてください。';
  END IF;
  IF (p_action='approve') THEN
    IF (candidate_count<>1 OR chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 候補が更新されました。再読み込みしてください。';
    END IF;
  ELSEIF (p_action='manual') THEN
    chosen_value := __DB__.__SCHEMA__.TEXT_VALUE(:p_value);
    chosen_kind := 'manual';
    chosen_label := '担当者による確認';
    IF (chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 値を記入してください。';
    END IF;
  END IF;
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION
  SET value=:chosen_value,
      decision_state=CASE WHEN :p_action IN ('approve','manual') THEN 'confirmed'
                          WHEN :p_action='reject' THEN 'rejected' ELSE 'pending' END,
      candidate_id=IFF(:p_action='approve',:p_candidate,NULL),
      source_path=:chosen_path,source_label=:chosen_label,source_kind=:chosen_kind,
      source_note=:p_note,evidence_signature=:current_signature,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  WHERE product_slug=:p_product AND attr_key=:p_attr;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 更新件数が一致しません。保存を取り消しました。';
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT :event_id,:p_product,'master',:p_attr,:p_action,:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,
    'revision',revision,'candidate_id',candidate_id,'source_path',source_path,
    'source_kind',source_kind,'source_note',source_note,'signature',evidence_signature),CURRENT_USER()
  FROM __DB__.__SCHEMA__.MASTER_DECISION WHERE product_slug=:p_product AND attr_key=:p_attr;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 履歴件数が一致しません。保存を取り消しました。';
  END IF;
  COMMIT;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('committed',TRUE,'event_id',:event_id,
    'product',:p_product,'scope','master','field',:p_attr,
    'revision',:p_revision+1,'value',:chosen_value,'action',:p_action,'evidence_signature',:current_signature));
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.DECIDE_FORM(
  p_product STRING,p_form STRING,p_field STRING,p_revision NUMBER,
  p_template_signature STRING,p_attr STRING,p_master_revision NUMBER,
  p_value STRING,p_source_path STRING,p_source_version STRING,p_note STRING,p_action STRING)
COPY GRANTS
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  event_id STRING DEFAULT UUID_STRING();
  affected NUMBER;
  chosen_value STRING;
  chosen_version STRING;
  current_template STRING;
  old_record VARIANT;
BEGIN
  IF (p_action IS NULL OR p_action NOT IN ('confirm','reopen') OR __DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN 'エラー: 操作と確認内容を確認してください。';
  END IF;
  BEGIN TRANSACTION;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION SET revision=revision+1
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field AND revision=:p_revision;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 他の操作で更新されました。再読み込みしてください。';
  END IF;
  SELECT OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision-1,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note),current_template_signature
    INTO :old_record,:current_template
  FROM (
    SELECT decision.*,field.template_signature AS current_template_signature
    FROM __DB__.__SCHEMA__.FORM_DECISION decision JOIN __DB__.__SCHEMA__.FORM_FIELD_V field
      ON field.form_id=decision.form_id AND field.field_key=decision.field_key
    WHERE decision.product_slug=:p_product AND decision.form_id=:p_form AND decision.field_key=:p_field
  );
  IF (NOT EQUAL_NULL(current_template,p_template_signature)) THEN
    ROLLBACK;
    RETURN 'エラー: 様式定義が更新されました。';
  END IF;
  IF (p_action='confirm' AND p_attr IS NOT NULL) THEN
    SELECT MAX(value),COUNT(*) INTO :chosen_value,:affected FROM __DB__.__SCHEMA__.MASTER_REVIEW_V
    WHERE product_slug=:p_product AND attr_key=:p_attr AND status='confirmed' AND revision=:p_master_revision;
    IF (affected<>1 OR chosen_value IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: マスターが未確定、または更新されました。';
    END IF;
  ELSEIF (p_action='confirm') THEN
    chosen_value := __DB__.__SCHEMA__.TEXT_VALUE(:p_value);
    IF (chosen_value IS NULL OR p_source_path IS NULL) THEN
      ROLLBACK;
      RETURN 'エラー: 値と根拠文書を指定してください。';
    END IF;
    SELECT version_key INTO :chosen_version FROM __DB__.__SCHEMA__.DOCUMENT_V
    WHERE product_slug=:p_product AND stage_path=:p_source_path AND is_current;
    IF (chosen_version IS NULL OR NOT EQUAL_NULL(chosen_version,p_source_version)) THEN
      ROLLBACK;
      RETURN 'エラー: 根拠文書が更新または削除されました。';
    END IF;
  END IF;
  UPDATE __DB__.__SCHEMA__.FORM_DECISION
  SET value=:chosen_value,decision_state=IFF(:p_action='confirm','confirmed','pending'),
      selected_attr=IFF(:p_action='confirm',:p_attr,NULL),
      master_revision=IFF(:p_action='confirm' AND :p_attr IS NOT NULL,:p_master_revision,NULL),
      source_path=IFF(:p_action='confirm' AND :p_attr IS NULL,:p_source_path,NULL),
      source_version=:chosen_version,source_note=:p_note,template_signature=:current_template,
      decided_by=CURRENT_USER(),decided_at=CURRENT_TIMESTAMP()
  WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 更新件数が一致しません。保存を取り消しました。';
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT :event_id,:p_product,:p_form,:p_field,:p_action,:old_record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
    'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
    'source_version',source_version,'note',source_note),CURRENT_USER()
  FROM __DB__.__SCHEMA__.FORM_DECISION WHERE product_slug=:p_product AND form_id=:p_form AND field_key=:p_field;
  affected := SQLROWCOUNT;
  IF (affected<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 履歴件数が一致しません。保存を取り消しました。';
  END IF;
  COMMIT;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('committed',TRUE,'event_id',:event_id,
    'product',:p_product,'scope',:p_form,'field',:p_field,
    'revision',:p_revision+1,'value',:chosen_value,'action',:p_action,'template_signature',:current_template,'master_revision',IFF(:p_action='confirm' AND :p_attr IS NOT NULL,:p_master_revision,NULL),'source_version',:chosen_version));
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;


CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_LAYOUT (
  layout_id STRING NOT NULL, version STRING NOT NULL, form_id STRING NOT NULL,
  mapping_hash STRING NOT NULL, definition VARIANT NOT NULL,
  review_status STRING NOT NULL DEFAULT 'pending',
  PRIMARY KEY(layout_id,version)
);
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS layout_snapshot VARIANT;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.PREPARE_LAYOUT_EXPORT(
  p_product STRING,p_form STRING,p_kind STRING,p_layout STRING,p_version STRING,p_hash STRING)
COPY GRANTS
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  definition VARIANT;
  payload VARIANT;
  layout_snapshot VARIANT;
  export_id STRING;
  matched NUMBER;
  invalid_count NUMBER;
BEGIN
  IF (p_kind IS NULL OR p_kind NOT IN ('review_only','test_only')) THEN
    RETURN OBJECT_CONSTRUCT('error','出力区分を確認してください。');
  END IF;
  SELECT COUNT(*),ANY_VALUE(definition) INTO :matched,:definition
  FROM __DB__.__SCHEMA__.FORM_LAYOUT
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='reviewed_draft';
  IF (matched<>1) THEN RETURN OBJECT_CONSTRUCT('error','指定様式は確認待ち、または版が変わりました。'); END IF;
  IF (NOT EQUAL_NULL(definition:id::STRING,p_layout) OR NOT EQUAL_NULL(definition:version::STRING,p_version)
      OR NOT EQUAL_NULL(definition:form::STRING,p_form)) THEN
    RETURN OBJECT_CONSTRUCT('error','帳票定義の識別子が一致しません。');
  END IF;
  IF (NOT COALESCE(ARRAY_CONTAINS(TO_VARIANT(:p_product),definition:products),FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','この商品の適用確認がありません。');
  END IF;
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'field_key',field_key,'label',field_label,'section',section,
    'value',IFF(status='confirmed' OR (:p_kind='test_only' AND status='test_confirmed'),value,NULL),
    'status',status,'required',required,'source_path',source_path,'source_version',source_version,
    'source_note',source_note,'master_attr',selected_attr,'master_revision',master_revision,
    'master_signature',master_signature,'master_evidence_signature',master_evidence_signature,
    'master_source_path',master_source_path,'revision',revision,'decided_by',decided_by,
    'template_signature',current_template_signature)) WITHIN GROUP (ORDER BY display_order,field_key)
    INTO :payload
  FROM (
    SELECT reviewed.*,master.evidence_signature AS master_evidence_signature,master.source_path AS master_source_path
    FROM __DB__.__SCHEMA__.FORM_REVIEW_V reviewed LEFT JOIN __DB__.__SCHEMA__.MASTER_DECISION master
      ON master.product_slug=reviewed.product_slug AND master.attr_key=reviewed.selected_attr
    WHERE reviewed.product_slug=:p_product AND reviewed.form_id=:p_form
  );
  IF (COALESCE(ARRAY_SIZE(payload),0)=0) THEN RETURN OBJECT_CONSTRUCT('error','対象様式がありません。'); END IF;
  SELECT COUNT(*) INTO :invalid_count FROM (
    SELECT field.index
    FROM TABLE(FLATTEN(input=>:definition:fields)) field
    LEFT JOIN TABLE(FLATTEN(input=>:payload)) snapshot_row
      ON snapshot_row.value:field_key::STRING=field.value:key::STRING
    GROUP BY field.index
    HAVING COUNT(snapshot_row.index)<>1 OR COUNT_IF(EQUAL_NULL(snapshot_row.value:template_signature::STRING,field.value:signature::STRING))<>1
  );
  IF (invalid_count<>0) THEN RETURN OBJECT_CONSTRUCT('error','差込欄の意味・版が一致しません。'); END IF;
  SELECT COUNT(*) INTO :matched FROM __DB__.__SCHEMA__.FORM_LAYOUT
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='reviewed_draft';
  IF (matched<>1) THEN RETURN OBJECT_CONSTRUCT('error','生成中に帳票版が変更されました。'); END IF;
  export_id := UUID_STRING();
  layout_snapshot := OBJECT_CONSTRUCT('id',p_layout,'version',p_version,'hash',p_hash,'definition',definition);
  INSERT INTO __DB__.__SCHEMA__.EXPORT_HISTORY(export_id,product_slug,form_id,export_kind,rows_snapshot,created_by,layout_snapshot)
  SELECT :export_id,:p_product,:p_form,:p_kind,:payload,CURRENT_USER(),:layout_snapshot;
  RETURN OBJECT_CONSTRUCT('export_id',export_id,'rows',payload,'kind',p_kind,
    'layout',OBJECT_CONSTRUCT('id',p_layout,'version',p_version,'hash',p_hash));
END;
$$;
-- Generated by scripts/upload-migration.mjs; shared pipeline SQL unchanged.
CREATE STAGE IF NOT EXISTS __DB__.__SCHEMA__.UPLOADS
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
  COMMENT = '打ち合わせでその場で受け取った原本。既存のRAW原本とは分離する。';

-- Structuring-test uploads are marked on the registry row. The column is added
-- rather than declared because DOC_REGISTRY is cloned from the pipeline schema.
-- IF NOT EXISTS cannot be combined with DEFAULT in Snowflake, so the column is
-- nullable and back-filled instead; readers treat NULL as 'production'.
-- Emitted before DOCUMENT_ALL_V, which selects the column.
ALTER TABLE __DB__.__SCHEMA__.DOC_REGISTRY ADD COLUMN IF NOT EXISTS upload_purpose STRING;
UPDATE __DB__.__SCHEMA__.DOC_REGISTRY SET upload_purpose='production' WHERE upload_purpose IS NULL;

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.DOCUMENT_ALL_V AS
SELECT registry.stage_path, registry.product_slug, registry.original_filename,
       COALESCE(registry.upload_purpose, 'production') AS upload_purpose,
       CASE WHEN registry.doc_role = 'output'
              OR registry.doc_type = 'deliverable'
              OR LOWER(classified.doc_kind) = 'form'
            THEN 'output' ELSE registry.doc_role END AS doc_role,
       COALESCE(LOWER(classified.doc_kind), registry.doc_type) AS doc_type,
       classified.doc_title, registry.ext,
       registry.submit_to, __DB__.__SCHEMA__.NORMALIZE_TEXT(registry.submit_to) AS customer_key,
       version.md5 AS captured_md5, directory.md5 AS current_md5,
       directory.size AS size_bytes,
       (directory.relative_path IS NOT NULL
        AND version.md5 IS NOT NULL
        AND EQUAL_NULL(version.md5, directory.md5)
        AND EQUAL_NULL(version.last_modified, directory.last_modified)) AS is_current,
       SHA2(CONCAT_WS('|', registry.stage_path, COALESCE(directory.md5, 'missing'),
            COALESCE(TO_CHAR(CONVERT_TIMEZONE('UTC', directory.last_modified),
                            'YYYY-MM-DD"T"HH24:MI:SS.FF9'), 'missing')), 256) AS version_key
FROM __DB__.__SCHEMA__.DOC_REGISTRY registry
LEFT JOIN __DB__.__SCHEMA__.DOC_CLASSIFIED classified ON classified.stage_path = registry.stage_path
LEFT JOIN __DB__.__SCHEMA__.DOC_VERSION version ON version.stage_path = registry.stage_path
LEFT JOIN (
  SELECT relative_path,md5,size,last_modified FROM DIRECTORY(@__DB__.__SCHEMA__.RAW)
  UNION ALL
  SELECT relative_path,md5,size,last_modified FROM DIRECTORY(@__DB__.__SCHEMA__.UPLOADS)
) directory
       ON directory.relative_path = registry.stage_path;


-- What every existing view and procedure sees: production documents only.
CREATE OR REPLACE VIEW __DB__.__SCHEMA__.DOCUMENT_V AS
SELECT * FROM __DB__.__SCHEMA__.DOCUMENT_ALL_V WHERE upload_purpose='production';

CREATE OR REPLACE VIEW __DB__.__SCHEMA__.CANDIDATE_V AS
WITH extracted AS (
  SELECT stage_path, doc_type, extracted FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE err IS NULL
  UNION ALL
  SELECT stage_path, doc_type, extracted FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP WHERE err IS NULL
), flat AS (
  SELECT extracted.stage_path, extracted.doc_type, item.key::STRING AS extract_key,
         __DB__.__SCHEMA__.TEXT_VALUE(item.value::STRING) AS raw_value
  FROM extracted, LATERAL FLATTEN(input => extracted.extracted) item
), document_values AS (
  SELECT DISTINCT doc.product_slug, mapping.attr_key, flat.raw_value,
         doc.stage_path AS source_path, doc.original_filename AS source_label,
         doc.version_key, mapping.is_primary, 'document' AS source_kind
  FROM flat
  JOIN __DB__.__SCHEMA__.DOCUMENT_ALL_V doc ON doc.stage_path = flat.stage_path
  JOIN __DB__.__SCHEMA__.ATTR_SOURCE_MAP mapping
    ON mapping.extract_key = flat.extract_key
   AND (mapping.doc_type = '*' OR mapping.doc_type = flat.doc_type)
  WHERE doc.doc_role = 'input' AND doc.is_current AND flat.raw_value IS NOT NULL
), business_values AS (
  SELECT product_slug, 'supplier_company' AS attr_key,
         supplier_company AS raw_value, NULL AS source_path,
         '顧客提供 商品・仕入先・顧客表' AS source_label,
         SHA2(COALESCE(supplier_company, ''), 256) AS version_key,
         TRUE AS is_primary, 'customer_master' AS source_kind
  FROM __DB__.__SCHEMA__.PRODUCT_SUPPLY WHERE supplier_company IS NOT NULL
), all_values AS (
  SELECT * FROM document_values
  UNION ALL
  SELECT * FROM business_values
)
SELECT SHA2(TO_JSON(ARRAY_CONSTRUCT(product_slug, attr_key, raw_value,
              source_path, version_key, is_primary)), 256) AS candidate_id,
       product_slug, attr_key, raw_value,
       __DB__.__SCHEMA__.NORMALIZE_TEXT(raw_value) AS compare_value,
       source_path, source_label, version_key, is_primary, source_kind
FROM all_values;


CREATE OR REPLACE VIEW __DB__.__SCHEMA__.EVIDENCE_V AS
SELECT product_slug, attr_key, COUNT(*) AS n_candidates,
       COUNT(DISTINCT compare_value) AS n_values,
       COUNT(DISTINCT source_path) AS n_documents,
       SHA2(LISTAGG(candidate_id, '|') WITHIN GROUP (ORDER BY candidate_id), 256) AS signature
FROM __DB__.__SCHEMA__.CANDIDATE_V candidate
WHERE candidate.source_path IS NULL
   OR EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.DOCUMENT_V production
              WHERE production.stage_path = candidate.source_path)
GROUP BY product_slug, attr_key;


CREATE OR REPLACE VIEW __DB__.__SCHEMA__.UPLOAD_IMPACT_V AS
SELECT product_slug,
       COUNT_IF(status IN ('confirmed','test_confirmed','test_skipped','rejected')) AS n_decided,
       COUNT_IF(status='confirmed') AS n_confirmed,
       COUNT_IF(status IN ('test_confirmed','test_skipped')) AS n_test
FROM __DB__.__SCHEMA__.MASTER_REVIEW_V
GROUP BY product_slug;

-- One row per uploaded spreadsheet, pointing at the HTML the AI functions read.
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_RENDITION (
  stage_path STRING NOT NULL,
  render_path STRING NOT NULL,
  render_kind STRING NOT NULL,
  sheet_count NUMBER,
  char_count NUMBER,
  err STRING,
  created_at TIMESTAMP_LTZ
);

-- Stored transcription. Kept so a second preview costs nothing and so the review
-- screen can show what the AI actually read for a document that is not a PDF.
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.DOC_PARSE (
  stage_path STRING NOT NULL,
  product_slug STRING NOT NULL,
  page_index NUMBER NOT NULL,
  content STRING,
  page_count NUMBER,
  mode STRING,
  err STRING,
  parsed_at TIMESTAMP_LTZ
);

-- Registers exactly one uploaded file. Never rewrites an existing document row.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.REGISTER_UPLOAD(
  p_product STRING, p_product_name STRING, p_supplier STRING, p_stage_path STRING,
  p_doc_type STRING, p_submit_to STRING, p_original_filename STRING, p_new_product BOOLEAN,
  p_upload_purpose STRING)
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  file_md5 STRING;
  file_size NUMBER;
  file_ext STRING;
  found NUMBER;
  duplicate STRING;
  decided NUMBER;
  affected NUMBER;
BEGIN
  IF (p_stage_path IS NULL OR p_stage_path NOT LIKE 'uploads/%') THEN
    RETURN 'エラー: アップロード領域以外のパスは登録できません。';
  END IF;
  file_ext := LOWER(SPLIT_PART(:p_stage_path,'.',-1));
  IF (file_ext NOT IN ('pdf','xls','xlsx')) THEN
    RETURN 'エラー: 対応していないファイル形式です。PDFまたはExcelを指定してください。';
  END IF;
  IF (p_doc_type IS NULL OR p_doc_type NOT IN ('spec','sds','coa','catalog','form')) THEN
    RETURN 'エラー: 文書種別が不正です。';
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_original_filename) IS NULL) THEN
    RETURN 'エラー: 元のファイル名がありません。';
  END IF;
  ALTER STAGE __DB__.__SCHEMA__.UPLOADS REFRESH;
  SELECT COUNT(*),MAX(md5),MAX(size) INTO :found,:file_md5,:file_size
  FROM DIRECTORY(@__DB__.__SCHEMA__.UPLOADS) WHERE relative_path=:p_stage_path;
  IF (found<>1) THEN
    RETURN 'エラー: アップロードしたファイルをステージ上で確認できません。';
  END IF;
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOC_REGISTRY WHERE stage_path=:p_stage_path;
  IF (found<>0) THEN
    RETURN 'エラー: 同じパスの原本が既に登録されています。';
  END IF;
  SELECT MAX(registry.stage_path) INTO :duplicate
  FROM __DB__.__SCHEMA__.DOC_VERSION version JOIN __DB__.__SCHEMA__.DOC_REGISTRY registry ON registry.stage_path=version.stage_path
  WHERE version.md5=:file_md5;
  IF (duplicate IS NOT NULL) THEN
    RETURN 'エラー: 同じ内容の原本が既に登録されています: ' || duplicate;
  END IF;
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.PRODUCT WHERE product_slug=:p_product;
  IF (p_new_product AND found<>0) THEN
    RETURN 'エラー: 同じ商品キーが既に存在します。';
  END IF;
  IF (NOT p_new_product AND found<>1) THEN
    RETURN 'エラー: 対象の商品が見つかりません。';
  END IF;
  IF (p_new_product AND __DB__.__SCHEMA__.TEXT_VALUE(:p_product_name) IS NULL) THEN
    RETURN 'エラー: 新しい商品の名称を入力してください。';
  END IF;
  IF (p_upload_purpose IS NULL OR p_upload_purpose NOT IN ('production','test')) THEN
    RETURN 'エラー: 登録区分が不正です。';
  END IF;
  SELECT COALESCE(MAX(n_decided),0) INTO :decided FROM __DB__.__SCHEMA__.UPLOAD_IMPACT_V WHERE product_slug=:p_product;
  BEGIN TRANSACTION;
  -- A product is a production record whatever the upload purpose: PRODUCT,
  -- PRODUCT_SUPPLY and the two decision frames are not filtered by
  -- upload_purpose. A product first seen during a structuring test therefore
  -- appears in the master and form reviews with every field still unconfirmed,
  -- because the evidence from the test document itself is excluded there.
  IF (p_new_product) THEN
    INSERT INTO __DB__.__SCHEMA__.PRODUCT (product_slug,product_name,n_docs)
    SELECT :p_product,:p_product_name,0;
    IF (SQLROWCOUNT<>1) THEN
      ROLLBACK;
      RETURN 'エラー: 商品を登録できませんでした。';
    END IF;
    -- TEXT_VALUE is a UDF and cannot appear in a VALUES clause, so both inserts
    -- use INSERT ... SELECT.
    INSERT INTO __DB__.__SCHEMA__.PRODUCT_SUPPLY (product_slug,product_name_src,supplier_company,submit_to,
      n_input_docs,has_documents,n_output_docs,has_output_sample)
    SELECT :p_product,:p_product_name,__DB__.__SCHEMA__.TEXT_VALUE(:p_supplier),__DB__.__SCHEMA__.TEXT_VALUE(:p_submit_to),0,FALSE,0,FALSE;
    IF (SQLROWCOUNT<>1) THEN
      ROLLBACK;
      RETURN 'エラー: 仕入先情報を登録できませんでした。';
    END IF;
    INSERT INTO __DB__.__SCHEMA__.MASTER_DECISION(product_slug, attr_key)
SELECT product.product_slug, definition.attr_key
FROM __DB__.__SCHEMA__.PRODUCT product CROSS JOIN __DB__.__SCHEMA__.ATTR_DEF definition
WHERE product.product_slug=:p_product AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.MASTER_DECISION decision
  WHERE decision.product_slug = product.product_slug AND decision.attr_key = definition.attr_key);
    IF (SQLROWCOUNT<1) THEN
      ROLLBACK;
      RETURN 'エラー: 確認項目を初期化できませんでした。';
    END IF;
    INSERT INTO __DB__.__SCHEMA__.FORM_DECISION(product_slug,form_id,field_key)
SELECT product.product_slug, template.form_id, template.field_key
FROM __DB__.__SCHEMA__.PRODUCT product CROSS JOIN __DB__.__SCHEMA__.FORM_TEMPLATE template
WHERE product.product_slug=:p_product AND NOT EXISTS (SELECT 1 FROM __DB__.__SCHEMA__.FORM_DECISION decision WHERE decision.product_slug=product.product_slug
  AND decision.form_id=template.form_id AND decision.field_key=template.field_key);
    IF (SQLROWCOUNT<1) THEN
      ROLLBACK;
      RETURN 'エラー: 様式項目を初期化できませんでした。';
    END IF;
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DOC_REGISTRY (stage_path,product,product_slug,doc_role,doc_type,ext,
    size_bytes,original_filename,sha256,submit_to,upload_purpose)
  SELECT :p_stage_path,COALESCE(__DB__.__SCHEMA__.TEXT_VALUE(:p_product_name),MAX(product_name)),:p_product,
    CASE WHEN :p_doc_type='form' THEN 'output' ELSE 'input' END,:p_doc_type,:file_ext,
    :file_size,:p_original_filename,:file_md5,__DB__.__SCHEMA__.TEXT_VALUE(:p_submit_to),:p_upload_purpose
  FROM __DB__.__SCHEMA__.PRODUCT WHERE product_slug=:p_product;
  IF (SQLROWCOUNT<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 原本を登録できませんでした。';
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DOC_VERSION (stage_path,md5,size_bytes,last_modified,captured_at)
  SELECT relative_path,md5,size,last_modified,CURRENT_TIMESTAMP()
  FROM DIRECTORY(@__DB__.__SCHEMA__.UPLOADS) WHERE relative_path=:p_stage_path;
  IF (SQLROWCOUNT<>1) THEN
    ROLLBACK;
    RETURN 'エラー: 原本の版を記録できませんでした。';
  END IF;
  COMMIT;
  -- DOCUMENT_ALL_V, not DOCUMENT_V: this reports back whether the row the caller
  -- just registered is visible, and a structuring test upload is deliberately
  -- absent from the production-only view.
  SELECT COUNT(*) INTO :affected FROM __DB__.__SCHEMA__.DOCUMENT_ALL_V
  WHERE stage_path=:p_stage_path AND product_slug=:p_product AND is_current;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('registered',TRUE,'product',:p_product,
    'stage_path',:p_stage_path,'doc_type',:p_doc_type,'size_bytes',:file_size,
    'ext',:file_ext,'needs_render',:file_ext IN ('xls','xlsx'),
    'new_product',:p_new_product,'visible',:affected,'decided_before',:decided,
    'upload_purpose',:p_upload_purpose,
    'structured',FALSE));
END;
$$;

-- Converts one staged spreadsheet to HTML on the same stage. Values only: no
-- formatting, formulas or images are reproduced, and nothing is inferred for a
-- blank cell. Merged cells become colspan/rowspan so a label keeps its position
-- relative to its value without the value being repeated across the span.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.RENDER_SHEET_HTML(p_stage_path STRING)
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python','xlrd','openpyxl')
HANDLER = 'run'
EXECUTE AS CALLER
AS
$$
import html
import io
import json
import os
import tempfile

STAGE = "@__DB__.__SCHEMA__.UPLOADS"

def scalar(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()

def read_xls(data):
    import xlrd
    try:
        book = xlrd.open_workbook(file_contents=data, formatting_info=True)
    except NotImplementedError:
        book = xlrd.open_workbook(file_contents=data)

    def text(cell):
        if cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR):
            return ""
        if cell.ctype == xlrd.XL_CELL_DATE:
            stamp = xlrd.xldate_as_datetime(cell.value, book.datemode)
            if (stamp.hour, stamp.minute, stamp.second) == (0, 0, 0):
                return stamp.date().isoformat()
            return stamp.isoformat(sep=" ")
        return scalar(cell.value)

    sheets = []
    for sheet in book.sheets():
        grid = [[text(sheet.cell(row, column)) for column in range(sheet.ncols)]
                for row in range(sheet.nrows)]
        merges = [(top, left, bottom - top, right - left)
                  for top, bottom, left, right in getattr(sheet, "merged_cells", []) or []]
        sheets.append((sheet.name, grid, merges))
    return sheets

def read_xlsx(data):
    from openpyxl import load_workbook
    book = load_workbook(io.BytesIO(data), data_only=True)
    sheets = []
    for sheet in book.worksheets:
        grid = [[scalar(cell.value) for cell in row] for row in sheet.iter_rows()]
        merges = [(span.min_row - 1, span.min_col - 1,
                   span.max_row - span.min_row + 1, span.max_col - span.min_col + 1)
                  for span in sheet.merged_cells.ranges]
        sheets.append((sheet.title, grid, merges))
    return sheets

def trim(grid):
    while grid and not any(cell for cell in grid[-1]):
        grid.pop()
    width = max((len(row) for row in grid), default=0)
    while width > 0 and not any(row[width - 1] if width - 1 < len(row) else "" for row in grid):
        width -= 1
    return [[row[column] if column < len(row) else "" for column in range(width)] for row in grid]

def table(grid, merges):
    height = len(grid)
    width = len(grid[0]) if grid else 0
    spans = {}
    covered = set()
    for top, left, rows, columns in merges:
        if top >= height or left >= width or (rows <= 1 and columns <= 1):
            continue
        rows = min(rows, height - top)
        columns = min(columns, width - left)
        spans[(top, left)] = (rows, columns)
        for row in range(top, top + rows):
            for column in range(left, left + columns):
                if (row, column) != (top, left):
                    covered.add((row, column))
    lines = ["<table border=\"1\">"]
    for row in range(height):
        cells = []
        for column in range(width):
            if (row, column) in covered:
                continue
            rows, columns = spans.get((row, column), (1, 1))
            attributes = ""
            if rows > 1:
                attributes += " rowspan=\"" + str(rows) + "\""
            if columns > 1:
                attributes += " colspan=\"" + str(columns) + "\""
            cells.append("<td" + attributes + ">" + html.escape(grid[row][column]) + "</td>")
        lines.append("<tr>" + "".join(cells) + "</tr>")
    lines.append("</table>")
    return lines

def render(sheets):
    parts = [
        "<!doctype html>",
        "<html lang=\"ja\"><head><meta charset=\"utf-8\"><title>sheet</title></head><body>",
    ]
    for name, grid, merges in sheets:
        parts.append("<h2>" + html.escape(name) + "</h2>")
        if not grid:
            parts.append("<p>(empty sheet)</p>")
            continue
        parts.extend(table(grid, merges))
    parts.append("</body></html>")
    return "\n".join(parts)

def run(session, p_stage_path):
    lower = (p_stage_path or "").lower()
    if not lower.startswith("uploads/"):
        return json.dumps({"error": "アップロード領域以外のパスは変換できません。"}, ensure_ascii=False)
    if not lower.endswith((".xls", ".xlsx")):
        return json.dumps({"error": "Excel以外は変換対象外です。"}, ensure_ascii=False)
    try:
        with session.file.get_stream(STAGE + "/" + p_stage_path) as handle:
            data = handle.read()
        sheets = read_xls(data) if lower.endswith(".xls") else read_xlsx(data)
        sheets = [(name, trim(grid), merges) for name, grid, merges in sheets]
        document = render(sheets)
    except Exception as problem:
        return json.dumps({"error": type(problem).__name__ + ": " + str(problem)[:400]}, ensure_ascii=False)
    render_path = p_stage_path + ".html"
    directory = STAGE + "/" + os.path.dirname(render_path) + "/"
    with tempfile.TemporaryDirectory() as workspace:
        local = os.path.join(workspace, os.path.basename(render_path))
        with open(local, "w", encoding="utf-8") as sink:
            sink.write(document)
        results = session.file.put(local, directory, auto_compress=False, overwrite=False)
    if len(results) != 1 or results[0].status.upper() not in ("UPLOADED", "SKIPPED"):
        return json.dumps({"error": "変換結果をステージに保存できませんでした。"}, ensure_ascii=False)
    if results[0].status.upper() == "SKIPPED":
        return json.dumps({"error": "同じ名前の変換結果が既にあります。"}, ensure_ascii=False)
    return json.dumps({
        "error": None, "render_path": render_path, "render_kind": "html",
        "sheets": len(sheets), "chars": len(document),
    }, ensure_ascii=False)
$$;

-- Records the rendition for one uploaded spreadsheet. Appends only.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.RENDER_UPLOAD(p_stage_path STRING)
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  file_ext STRING;
  found NUMBER;
  raw STRING;
  render_err STRING;
  render_path STRING;
BEGIN
  IF (p_stage_path IS NULL OR p_stage_path NOT LIKE 'uploads/%') THEN
    RETURN 'エラー: アップロード領域以外のパスは変換できません。';
  END IF;
  file_ext := LOWER(SPLIT_PART(:p_stage_path,'.',-1));
  IF (file_ext NOT IN ('xls','xlsx')) THEN
    RETURN 'エラー: Excel以外は変換対象外です。';
  END IF;
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOC_REGISTRY WHERE stage_path=:p_stage_path;
  IF (found<>1) THEN
    RETURN 'エラー: 先に原本を登録してください。';
  END IF;
  SELECT COUNT(*),MAX(render_path) INTO :found,:render_path
  FROM __DB__.__SCHEMA__.DOC_RENDITION WHERE stage_path=:p_stage_path;
  IF (found>0) THEN
    RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('rendered',TRUE,'cached',TRUE,
      'stage_path',:p_stage_path,'render_path',:render_path));
  END IF;
  CALL __DB__.__SCHEMA__.RENDER_SHEET_HTML(:p_stage_path) INTO :raw;
  SELECT PARSE_JSON(:raw):error::STRING,PARSE_JSON(:raw):render_path::STRING
  INTO :render_err,:render_path;
  IF (render_err IS NOT NULL) THEN
    RETURN 'エラー: Excelを変換できませんでした: ' || render_err;
  END IF;
  IF (render_path IS NULL) THEN
    RETURN 'エラー: 変換結果のパスを確認できません。';
  END IF;
  ALTER STAGE __DB__.__SCHEMA__.UPLOADS REFRESH;
  SELECT COUNT(*) INTO :found
  FROM DIRECTORY(@__DB__.__SCHEMA__.UPLOADS) WHERE relative_path=:render_path;
  IF (found<>1) THEN
    RETURN 'エラー: 変換結果をステージ上で確認できません。';
  END IF;
  INSERT INTO __DB__.__SCHEMA__.DOC_RENDITION (stage_path,render_path,render_kind,sheet_count,char_count,err,created_at)
  SELECT :p_stage_path,:render_path,PARSE_JSON(:raw):render_kind::STRING,
    PARSE_JSON(:raw):sheets::NUMBER,PARSE_JSON(:raw):chars::NUMBER,NULL,CURRENT_TIMESTAMP();
  IF (SQLROWCOUNT<>1) THEN
    RETURN 'エラー: 変換結果を記録できませんでした。';
  END IF;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('rendered',TRUE,'cached',FALSE,
    'stage_path',:p_stage_path,'render_path',:render_path,
    'sheets',PARSE_JSON(:raw):sheets,'chars',PARSE_JSON(:raw):chars));
END;
$$;

-- Transcribes exactly one uploaded file with AI_PARSE_DOCUMENT and stores the
-- result. A second call returns the stored text instead of calling the AI again.
--
-- Mode is chosen by measurement, not preference. On a 12-page SDS, LAYOUT took
-- 496 seconds against 5 seconds for OCR, so a PDF is transcribed with OCR: a
-- preview a person waits for cannot cost eight minutes. An HTML rendition of a
-- spreadsheet is already structured text and completed in about 20 seconds under
-- LAYOUT, so it keeps the table-preserving mode.
-- page_split is only set for paged formats; HTML and TXT reject the option.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.PARSE_UPLOAD(p_stage_path STRING)
-- Owner's rights, unlike every other procedure here. Under the app's restricted
-- caller's rights an AI function name cannot be resolved at all: AI_PARSE_DOCUMENT
-- and AI_EXTRACT fail as "Unknown function" even with CORTEX_USER, CALLER USAGE on
-- DATABASE SNOWFLAKE, the account USE AI FUNCTIONS privileges in both plain and
-- CALLER form, and the CORTEX-MODEL-ROLE-ALL application role all granted. Running
-- as the owner sidesteps the intersection entirely. This costs no audit fidelity
-- because the body records no CURRENT_USER or CURRENT_ROLE, and the caller still
-- needs USAGE on the procedure to reach it.
RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER AS
$$
DECLARE
  doc_slug STRING;
  ai_path STRING;
  file_ext STRING;
  found NUMBER;
  cached BOOLEAN;
  paged BOOLEAN;
  parse_mode STRING;
  raw STRING;
  n_pages NUMBER;
  n_chars NUMBER;
  parse_err STRING;
  started TIMESTAMP_LTZ;
BEGIN
  started := CURRENT_TIMESTAMP();
  cached := FALSE;
  IF (p_stage_path IS NULL OR p_stage_path NOT LIKE 'uploads/%') THEN
    RETURN 'エラー: アップロード領域以外のパスは処理できません。';
  END IF;
  SELECT COUNT(*),MAX(product_slug) INTO :found,:doc_slug
  FROM __DB__.__SCHEMA__.DOC_REGISTRY WHERE stage_path=:p_stage_path;
  IF (found<>1) THEN
    RETURN 'エラー: 先に原本を登録してください。';
  END IF;
  SELECT COALESCE(MAX(render_path),:p_stage_path) INTO :ai_path
  FROM __DB__.__SCHEMA__.DOC_RENDITION WHERE stage_path=:p_stage_path;
  file_ext := LOWER(SPLIT_PART(:p_stage_path,'.',-1));
  IF (file_ext IN ('xls','xlsx') AND :ai_path=:p_stage_path) THEN
    RETURN 'エラー: Excelの変換が済んでいません。先に変換してください。';
  END IF;
  paged := ENDSWITH(LOWER(:ai_path),'.pdf');
  parse_mode := IFF(:paged,'OCR','LAYOUT');
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOC_PARSE WHERE stage_path=:p_stage_path;
  IF (found>0) THEN
    cached := TRUE;
  ELSE
    IF (paged) THEN
      SELECT AI_PARSE_DOCUMENT(TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),{'mode':'OCR','page_split':TRUE}) INTO :raw;
    ELSE
      SELECT AI_PARSE_DOCUMENT(TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),{'mode':'LAYOUT'}) INTO :raw;
    END IF;
    IF (raw IS NULL) THEN
      RETURN 'エラー: 文字起こしできませんでした。原本の形式と内容を確認してください。';
    END IF;
    IF (paged) THEN
      INSERT INTO __DB__.__SCHEMA__.DOC_PARSE (stage_path,product_slug,page_index,content,page_count,mode,err,parsed_at)
      SELECT :p_stage_path,:doc_slug,page.value:index::NUMBER,page.value:content::STRING,
        ARRAY_SIZE(PARSE_JSON(:raw):pages),:parse_mode,PARSE_JSON(:raw):error::STRING,CURRENT_TIMESTAMP()
      FROM TABLE(FLATTEN(input=>PARSE_JSON(:raw):pages)) page;
    ELSE
      INSERT INTO __DB__.__SCHEMA__.DOC_PARSE (stage_path,product_slug,page_index,content,page_count,mode,err,parsed_at)
      SELECT :p_stage_path,:doc_slug,0,PARSE_JSON(:raw):content::STRING,1,:parse_mode,
        PARSE_JSON(:raw):error::STRING,CURRENT_TIMESTAMP();
    END IF;
    IF (SQLROWCOUNT<1) THEN
      RETURN 'エラー: 文字起こしを保存できませんでした。';
    END IF;
  END IF;
  SELECT COUNT(*),SUM(LENGTH(COALESCE(content,''))),MAX(err),MAX(mode) INTO :n_pages,:n_chars,:parse_err,:parse_mode
  FROM __DB__.__SCHEMA__.DOC_PARSE WHERE stage_path=:p_stage_path;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('parsed',TRUE,'cached',:cached,
    'product',:doc_slug,'stage_path',:p_stage_path,'source_path',:ai_path,
    'mode',:parse_mode,'pages',:n_pages,'chars',:n_chars,'parse_error',:parse_err,
    'elapsed_ms',DATEDIFF('millisecond',:started,CURRENT_TIMESTAMP())));
END;
$$;

-- Classifies and extracts exactly one uploaded file. Appends only; existing
-- extraction rows and confirmed values are never overwritten.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.STRUCTURE_UPLOAD(p_stage_path STRING, p_consent BOOLEAN)
-- Owner's rights for the same reason as PARSE_UPLOAD: this body calls AI_EXTRACT,
-- which restricted caller's rights cannot resolve. The consent flag is still
-- checked here, so owner's rights does not skip any guard.
RETURNS STRING LANGUAGE SQL EXECUTE AS OWNER AS
$$
DECLARE
  doc_slug STRING;
  doc_kind STRING;
  filename_kind STRING;
  ai_path STRING;
  file_ext STRING;
  found NUMBER;
  decided NUMBER;
  classify_err STRING;
  extract_err STRING;
  gap_err STRING;
  n_candidates NUMBER;
  started TIMESTAMP_LTZ;
BEGIN
  started := CURRENT_TIMESTAMP();
  IF (p_stage_path IS NULL OR p_stage_path NOT LIKE 'uploads/%') THEN
    RETURN 'エラー: アップロード領域以外のパスは処理できません。';
  END IF;
  SELECT COUNT(*),MAX(product_slug),MAX(doc_type) INTO :found,:doc_slug,:filename_kind
  FROM __DB__.__SCHEMA__.DOC_REGISTRY WHERE stage_path=:p_stage_path;
  IF (found<>1) THEN
    RETURN 'エラー: 先に原本を登録してください。';
  END IF;
  SELECT COALESCE(MAX(render_path),:p_stage_path) INTO :ai_path
  FROM __DB__.__SCHEMA__.DOC_RENDITION WHERE stage_path=:p_stage_path;
  file_ext := LOWER(SPLIT_PART(:p_stage_path,'.',-1));
  IF (file_ext IN ('xls','xlsx') AND :ai_path=:p_stage_path) THEN
    RETURN 'エラー: Excelの変換が済んでいません。先に変換してください。';
  END IF;
  -- DOCUMENT_ALL_V: a per-document version check must see test uploads too,
  -- otherwise structuring a test document fails as a missing version.
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOCUMENT_ALL_V WHERE stage_path=:p_stage_path AND is_current;
  IF (found<>1) THEN
    RETURN 'エラー: 原本の版を確認できません。再読み込みしてください。';
  END IF;
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE stage_path=:p_stage_path;
  IF (found<>0) THEN
    RETURN 'エラー: この原本は既に構造化済みです。';
  END IF;
  SELECT COALESCE(MAX(n_decided),0) INTO :decided FROM __DB__.__SCHEMA__.UPLOAD_IMPACT_V WHERE product_slug=:doc_slug;
  IF (decided>0 AND NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN 'エラー: 確定済み' || decided || '件が要再確認に戻ります。影響を確認してから実行してください。';
  END IF;
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOC_CLASSIFIED WHERE stage_path=:p_stage_path;
  IF (found=0) THEN
    INSERT INTO __DB__.__SCHEMA__.DOC_CLASSIFIED (stage_path,product_slug,original_filename,doc_type_filename,
      doc_kind,doc_title,has_lot,doc_kind_score,err)
    SELECT :p_stage_path,:doc_slug,MAX(registry.original_filename),:filename_kind,
      MAX(x:response:doc_kind::STRING),MAX(x:response:title::STRING),MAX(x:response:has_lot::STRING),
      MAX(x:scoring:scores:doc_kind:score::FLOAT),MAX(x:error::STRING)
    FROM __DB__.__SCHEMA__.DOC_REGISTRY registry,
      LATERAL (SELECT AI_EXTRACT(
        file => TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),
        responseFormat => [
['doc_kind',
          'この文書の種類を次のどれか1語で答えてください。'
          || 'coa（特定ロットの実測値が載った試験成績書・分析証明書）、'
          || 'sds（安全データシート。GHS分類や適用法令が載っている）、'
          || 'spec（規格書・品質規格書。試験項目と規格値の範囲が載っているがロット固有の実測値はない）、'
          || 'catalog（カタログ・技術資料・TDS。販促や処方提案が中心）、'
          || 'form（取引先へ提出する調査票・納入仕様書・情報票such as帳票）、'
          || 'internal（社内の議事録・打合せ資料）'],
         ['title',   'この文書の表題は何ですか'],
         ['has_lot', 'この文書に特定のロット番号またはバッチ番号が記載されていますか。はい か いいえ で答えてください']
        ],
        scores => TRUE) AS x) v
    WHERE registry.stage_path=:p_stage_path;
    IF (SQLROWCOUNT<>1) THEN
      RETURN 'エラー: 文書種別を判定できませんでした。';
    END IF;
  END IF;
  SELECT MAX(err),MAX(LOWER(doc_kind)) INTO :classify_err,:doc_kind
  FROM __DB__.__SCHEMA__.DOC_CLASSIFIED WHERE stage_path=:p_stage_path;
  IF (doc_kind IS NULL OR doc_kind NOT IN ('spec','sds','coa','catalog','form','internal')) THEN
    doc_kind := :filename_kind;
  END IF;
  IF (doc_kind IN ('spec','sds','coa')) THEN
    IF (doc_kind='sds') THEN
      INSERT INTO __DB__.__SCHEMA__.DOC_EXTRACT (stage_path,product_slug,doc_type,extracted,scores,err)
  SELECT :p_stage_path,:doc_slug,:doc_kind,x:response,x:scoring:scores,x:error::STRING
  FROM (SELECT AI_EXTRACT(
    file => TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),
    responseFormat => [
['product_name',    '製品名（化学品の名称）は何ですか'],
          ['supplier_name',   '供給者（会社名）は何ですか'],
          ['supplier_addr',   '供給者の住所は何ですか'],
          ['revision_date',   '改訂日または作成日はいつですか'],
          ['sds_version',     'SDSの版番号（バージョン）は何ですか'],
          ['ingredients',     '成分及び含有量に記載されている化学物質名をすべて挙げてください'],
          ['cas_numbers',     '記載されているCAS番号をすべて挙げてください'],
          ['anzeiho',         '労働安全衛生法（安衛法）に関する記載内容は何ですか。名称等を通知すべき危険物・有害物に該当するかどうかも含めて'],
          ['prtr',            '化学物質排出把握管理促進法（PRTR法）に関する記載内容は何ですか。該当・非該当も含めて'],
          ['kashinho',        '化学物質審査規制法（化審法）に関する記載内容は何ですか。既存・新規などの区分も含めて'],
          ['shoboho',         '消防法に関する記載内容は何ですか。危険物の類別も含めて'],
          ['dokugeki',        '毒物及び劇物取締法に関する記載内容は何ですか。該当・非該当も含めて'],
          ['ghs_hazard',      'GHS分類・危険有害性情報として記載されている内容は何ですか'],
          ['appearance',      '外観（性状・色）はどう記載されていますか'],
          ['ph_value',        'pHはいくらと記載されていますか'],
          ['storage',         '保管方法・貯蔵条件はどう記載されていますか']
        ],
    config => {'scale_factor': 2.0},
    scores => TRUE) AS x);
    ELSEIF (doc_kind='spec') THEN
      INSERT INTO __DB__.__SCHEMA__.DOC_EXTRACT (stage_path,product_slug,doc_type,extracted,scores,err)
  SELECT :p_stage_path,:doc_slug,:doc_kind,x:response,x:scoring:scores,x:error::STRING
  FROM (SELECT AI_EXTRACT(
    file => TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),
    responseFormat => {
'schema': {
            'type': 'object',
            'properties': {
              'product_name':   {'description':'製品名・品名は何ですか','type':'string'},
              'maker_name':     {'description':'製造者・メーカーの会社名は何ですか','type':'string'},
              'inci_name':      {'description':'INCI名（国際化粧品原料名）は何ですか','type':'string'},
              'display_name':   {'description':'化粧品の表示名称（成分表示名）は何ですか','type':'string'},
              'standard_basis': {'description':'準拠している規格は何ですか。外原規・日局・自主規格などの区分','type':'string'},
              'shelf_life':     {'description':'有効期限・品質保証期限はどう記載されていますか','type':'string'},
              'storage':        {'description':'保存条件・保管方法はどう記載されていますか','type':'string'},
              'packaging':      {'description':'荷姿・包装形態・入目量はどう記載されていますか','type':'string'},
              'origin':         {'description':'原料の由来・起源はどう記載されていますか','type':'string'},
              'spec_table': {
                'description':'規格表。試験項目とその規格値・判定基準の一覧',
                'type':'object',
                'column_ordering':['item','specification','method'],
                'properties':{
                  'item':          {'description':'試験項目','type':'array'},
                  'specification': {'description':'規格値','type':'array'},
                  'method':        {'description':'試験方法','type':'array'}
                }
              }
            }
          }
        },
    config => {'scale_factor': 2.0},
    scores => TRUE) AS x);
    ELSE
      INSERT INTO __DB__.__SCHEMA__.DOC_EXTRACT (stage_path,product_slug,doc_type,extracted,scores,err)
  SELECT :p_stage_path,:doc_slug,:doc_kind,x:response,x:scoring:scores,x:error::STRING
  FROM (SELECT AI_EXTRACT(
    file => TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),
    responseFormat => {
'schema': {
            'type': 'object',
            'properties': {
              'product_name':  {'description':'製品名は何ですか','type':'string'},
              'lot_number':    {'description':'ロット番号・バッチ番号は何ですか','type':'string'},
              'mfg_date':      {'description':'製造日はいつですか','type':'string'},
              'expiry_date':   {'description':'有効期限・再検査日はいつですか','type':'string'},
              'quantity':      {'description':'数量はいくらですか','type':'string'},
              'result_table': {
                'description':'試験成績表。試験項目・規格値・実測結果の一覧',
                'type':'object',
                'column_ordering':['item','specification','result'],
                'properties':{
                  'item':          {'description':'試験項目','type':'array'},
                  'specification': {'description':'規格値','type':'array'},
                  'result':        {'description':'実測結果','type':'array'}
                }
              }
            }
          }
        },
    config => {'scale_factor': 2.0},
    scores => TRUE) AS x);
    END IF;
    SELECT MAX(err) INTO :extract_err FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE stage_path=:p_stage_path;
  END IF;
  IF (doc_kind IN ('spec','sds','catalog')) THEN
    INSERT INTO __DB__.__SCHEMA__.DOC_EXTRACT_GAP (stage_path,product_slug,doc_type,extracted,scores,err)
    SELECT :p_stage_path,:doc_slug,:doc_kind,x:response,x:scoring:scores,x:error::STRING
    FROM (SELECT AI_EXTRACT(
      file => TO_FILE('@__DB__.__SCHEMA__.UPLOADS', :ai_path),
      responseFormat => [
['pack_container', '包装形態・荷姿の容器は何と記載されていますか（例: カートンボックス、ドラム、紙袋、内袋あり等）'],
          ['pack_qty',       '1包装あたりの入目量・正味重量は何kgですか。単位も含めて'],
          ['shelf_life',     '品質保証期限・有効期限・使用期限は何と記載されていますか。製造後/納入後などの起算点も含めて'],
          ['storage',        '保管条件・貯蔵方法はどう記載されていますか'],
          ['origin_country', '原産国・製造国・生産国はどこと記載されていますか'],
          ['final_country',  '最終加工地・最終製造地はどこと記載されていますか'],
          ['origin_type',    '原料の由来（合成・植物由来・動物由来・鉱物由来・石油由来など）はどう記載されていますか'],
          ['origin_detail',  '由来の詳細（原料となる植物名・動物種・出発物質など）はどう記載されていますか'],
          ['maker_name',     '製造者・製造元の会社名は何ですか。販売者や供給者ではなく製造者です'],
          ['inci_name',      'INCI名（国際化粧品原料表示名称）は何ですか']
      ],
      config => {'scale_factor': 2.0},
      scores => TRUE) AS x);
    SELECT MAX(err) INTO :gap_err FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP WHERE stage_path=:p_stage_path;
  END IF;
  SELECT COUNT(*) INTO :n_candidates FROM __DB__.__SCHEMA__.CANDIDATE_V
  WHERE product_slug=:doc_slug AND source_path=:p_stage_path;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('structured',TRUE,'product',:doc_slug,
    'stage_path',:p_stage_path,'doc_kind',:doc_kind,'filename_kind',:filename_kind,
    'candidates',:n_candidates,'decided_before',:decided,'consent',COALESCE(:p_consent,FALSE),
    'classify_error',:classify_err,'extract_error',:extract_err,'gap_error',:gap_err,
    'elapsed_ms',DATEDIFF('millisecond',:started,CURRENT_TIMESTAMP())));
END;
$$;

-- Generated by scripts/restructure-migration.mjs; re-runs one document.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.RESTRUCTURE_UPLOAD(p_stage_path STRING, p_consent BOOLEAN)
RETURNS STRING LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  found NUMBER;
  doc_slug STRING;
  decided NUMBER;
  n_extract NUMBER;
  n_gap NUMBER;
  n_classified NUMBER;
  previous_kind STRING;
  structured STRING;
  event_id STRING;
  started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
BEGIN
  IF (p_stage_path IS NULL OR p_stage_path NOT LIKE 'uploads/%') THEN
    RETURN 'エラー: アップロード領域以外のパスは処理できません。';
  END IF;
  SELECT COUNT(*),MAX(product_slug) INTO :found,:doc_slug FROM __DB__.__SCHEMA__.DOC_REGISTRY
  WHERE stage_path=:p_stage_path;
  IF (found<>1) THEN
    RETURN 'エラー: 先に原本を登録してください。';
  END IF;
  -- DOCUMENT_ALL_V: a per-document version check must see test uploads too,
  -- which are absent from the production-only DOCUMENT_V.
  SELECT COUNT(*) INTO :found FROM __DB__.__SCHEMA__.DOCUMENT_ALL_V
  WHERE stage_path=:p_stage_path AND is_current;
  IF (found<>1) THEN
    RETURN 'エラー: 原本の版を確認できません。再読み込みしてください。';
  END IF;
  SELECT COUNT(*) INTO :n_extract FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE stage_path=:p_stage_path;
  SELECT COUNT(*) INTO :n_gap FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP WHERE stage_path=:p_stage_path;
  SELECT COUNT(*),MAX(doc_kind) INTO :n_classified,:previous_kind FROM __DB__.__SCHEMA__.DOC_CLASSIFIED
  WHERE stage_path=:p_stage_path;
  -- All three are checked because a catalog document writes only to the gap
  -- table, so DOC_EXTRACT alone does not tell whether work exists.
  IF (n_extract=0 AND n_gap=0 AND n_classified=0) THEN
    RETURN 'エラー: まだ構造化していません。通常の構造化を使ってください。';
  END IF;
  SELECT COALESCE(MAX(n_decided),0) INTO :decided FROM __DB__.__SCHEMA__.UPLOAD_IMPACT_V
  WHERE product_slug=:doc_slug;
  -- Consent is required even when nothing is decided: the previous extraction is
  -- discarded either way.
  IF (NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN 'エラー: 前回の抽出結果を破棄します。この商品の確定済み' || decided ||
      '件は保持されますが、AIの出力が前回と変われば要再確認に戻ります。影響を確認してから実行してください。';
  END IF;
  event_id := UUID_STRING();
  BEGIN TRANSACTION;
  DELETE FROM __DB__.__SCHEMA__.DOC_EXTRACT WHERE stage_path=:p_stage_path;
  DELETE FROM __DB__.__SCHEMA__.DOC_EXTRACT_GAP WHERE stage_path=:p_stage_path;
  DELETE FROM __DB__.__SCHEMA__.DOC_CLASSIFIED WHERE stage_path=:p_stage_path;
  -- Runs inside the transaction so a refusal or an AI failure rolls the deletes
  -- back and the document keeps the extraction it already had.
  CALL __DB__.__SCHEMA__.STRUCTURE_UPLOAD(:p_stage_path, :p_consent) INTO :structured;
  IF (structured LIKE 'エラー%') THEN
    ROLLBACK;
    RETURN structured;
  END IF;
  -- The history table records decisions on fields; this is a document-level
  -- event, recorded with scope_id 'document' so the history panel shows that
  -- someone re-ran the extraction and when.
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT :event_id,:doc_slug,'document',:p_stage_path,'restructure',
    OBJECT_CONSTRUCT_KEEP_NULL('doc_kind',:previous_kind,'extract_rows',:n_extract,
      'gap_rows',:n_gap,'classified_rows',:n_classified),
    PARSE_JSON(:structured),CURRENT_USER();
  COMMIT;
  RETURN TO_JSON(OBJECT_CONSTRUCT_KEEP_NULL('restructured',TRUE,'product',:doc_slug,
    'stage_path',:p_stage_path,'previous_doc_kind',:previous_kind,
    'removed',OBJECT_CONSTRUCT('extract',:n_extract,'gap',:n_gap,'classified',:n_classified),
    'decided_before',:decided,'event_id',:event_id,
    'structured',PARSE_JSON(:structured),
    'elapsed_ms',DATEDIFF('millisecond',:started,CURRENT_TIMESTAMP())));
END;
$$;

-- Generated by scripts/bulk-master-migration.mjs; confirms many master values at once.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.CONFIRM_MASTER_BATCH(
  p_product STRING, p_items STRING, p_note STRING, p_consent BOOLEAN)
COPY GRANTS
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  requested NUMBER;
  matched NUMBER;
  typed NUMBER;
  bumped NUMBER;
  snapshot VARIANT;
BEGIN
  IF (NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一括確定の確認にチェックを入れてください。');
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 確認内容・出所を記入してください。');
  END IF;
  SELECT COUNT(*) INTO :requested FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items)));
  IF (requested = 0) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一括確定の対象がありません。');
  END IF;
  -- A cap keeps one mistaken press from rewriting an entire account's master
  -- data; the app pages the list rather than raising this.
  IF (requested > 400) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一度に確定できるのは400件までです。');
  END IF;
  BEGIN TRANSACTION;
  -- Every item must still line up with what the reviewer saw. Joined before any
  -- write so a stale page cannot apply even one row.
  -- Items approving an extracted candidate.
  SELECT COUNT(*) INTO :matched
  FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
  JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V review
    ON review.product_slug = :p_product
   AND review.attr_key = item.value:attr_key::STRING
   AND review.revision = item.value:revision::NUMBER
   AND EQUAL_NULL(review.current_signature, item.value:signature::STRING)
  JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate
    ON candidate.product_slug = :p_product
   AND candidate.attr_key = review.attr_key
   AND candidate.candidate_id = item.value:candidate_id::STRING;
  -- Items carrying a value the reviewer typed. Same revision and signature check;
  -- there is no candidate to match, so the value itself has to be present.
  SELECT COUNT(*) INTO :typed
  FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
  JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V review
    ON review.product_slug = :p_product
   AND review.attr_key = item.value:attr_key::STRING
   AND review.revision = item.value:revision::NUMBER
   AND EQUAL_NULL(review.current_signature, item.value:signature::STRING)
  WHERE item.value:candidate_id::STRING IS NULL
    AND __DB__.__SCHEMA__.TEXT_VALUE(item.value:value::STRING) IS NOT NULL;
  IF (matched + typed <> requested) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 他の操作または再抽出で内容が変わりました。再読み込みしてください。',
      'requested',:requested,'matched',:matched + :typed);
  END IF;
  -- Captured before the write because DECISION_HISTORY records both sides and the
  -- previous values are gone once the update lands.
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL('attr_key',attr_key,'record',
      OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
        'candidate_id',candidate_id,'source_path',source_path,'source_kind',source_kind,
        'source_note',source_note,'signature',evidence_signature)))
    INTO :snapshot
  FROM __DB__.__SCHEMA__.MASTER_DECISION
  WHERE product_slug = :p_product
    AND attr_key IN (SELECT item.value:attr_key::STRING FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item);
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION target SET revision = target.revision + 1
  FROM (SELECT item.value:attr_key::STRING AS attr_key, item.value:revision::NUMBER AS revision
        FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item) item
  WHERE target.product_slug = :p_product AND target.attr_key = item.attr_key
    AND target.revision = item.revision;
  bumped := SQLROWCOUNT;
  IF (bumped <> requested) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 他の操作で更新されました。再読み込みしてください。',
      'requested',:requested,'matched',:bumped);
  END IF;
  -- Each item took exactly one path, so the provenance columns are mutually
  -- exclusive per row: a candidate with its document, or a typed value with no
  -- document at all. The LEFT JOIN is what lets one statement write both; the
  -- column values mirror what DECIDE_MASTER records for 'approve' and 'manual'
  -- respectively, down to the 担当者による確認 label.
  UPDATE __DB__.__SCHEMA__.MASTER_DECISION target
  SET value = chosen.value,
      decision_state = 'confirmed',
      candidate_id = chosen.candidate_id,
      source_path = chosen.source_path,
      source_label = chosen.source_label,
      source_kind = chosen.source_kind,
      source_note = :p_note,
      evidence_signature = chosen.signature,
      decided_by = CURRENT_USER(),
      decided_at = CURRENT_TIMESTAMP()
  FROM (SELECT item.value:attr_key::STRING AS attr_key,
          candidate.candidate_id,
          COALESCE(candidate.raw_value, __DB__.__SCHEMA__.TEXT_VALUE(item.value:value::STRING)) AS value,
          candidate.source_path,
          COALESCE(candidate.source_label, '担当者による確認') AS source_label,
          COALESCE(candidate.source_kind, 'manual') AS source_kind,
          item.value:signature::STRING AS signature
        FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
        LEFT JOIN __DB__.__SCHEMA__.CANDIDATE_V candidate
          ON candidate.product_slug = :p_product
         AND candidate.attr_key = item.value:attr_key::STRING
         AND candidate.candidate_id = item.value:candidate_id::STRING) chosen
  WHERE target.product_slug = :p_product AND target.attr_key = chosen.attr_key;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,'master',decision.attr_key,
    IFF(decision.candidate_id IS NULL,'manual','approve'),
    previous.value:record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'candidate_id',decision.candidate_id,
      'source_path',decision.source_path,'source_kind',decision.source_kind,
      'source_note',decision.source_note,'signature',decision.evidence_signature),
    CURRENT_USER()
  FROM __DB__.__SCHEMA__.MASTER_DECISION decision
  JOIN TABLE(FLATTEN(input => :snapshot)) previous
    ON previous.value:attr_key::STRING = decision.attr_key
  WHERE decision.product_slug = :p_product;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('confirmed',:requested);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

-- Generated by scripts/bulk-form-migration.mjs; confirms many form fields at once.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.CONFIRM_FORM_BATCH(
  p_product STRING, p_form STRING, p_items STRING, p_note STRING, p_consent BOOLEAN)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  requested NUMBER;
  matched NUMBER;
  typed NUMBER;
  bumped NUMBER;
  snapshot VARIANT;
BEGIN
  IF (NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一括確定の確認にチェックを入れてください。');
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 確認内容・出所を記入してください。');
  END IF;
  SELECT COUNT(*) INTO :requested FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items)));
  IF (requested = 0) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一括確定の対象がありません。');
  END IF;
  IF (requested > 400) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 一度に確定できるのは400件までです。');
  END IF;
  BEGIN TRANSACTION;
  -- Items taking the master path.
  SELECT COUNT(*) INTO :matched
  FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
  JOIN __DB__.__SCHEMA__.FORM_REVIEW_V review
    ON review.product_slug = :p_product
   AND review.form_id = :p_form
   AND review.field_key = item.value:field_key::STRING
   AND review.revision = item.value:revision::NUMBER
   AND EQUAL_NULL(review.current_template_signature, item.value:template::STRING)
  JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
    ON master.product_slug = :p_product
   AND master.attr_key = item.value:attr_key::STRING
   AND master.revision = item.value:master_revision::NUMBER
   AND master.status = 'confirmed'
   AND master.value IS NOT NULL;
  -- Items carrying a value the reviewer typed after reading an original. The
  -- document check is the same one DECIDE_FORM applies to a single field.
  SELECT COUNT(*) INTO :typed
  FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
  JOIN __DB__.__SCHEMA__.FORM_REVIEW_V review
    ON review.product_slug = :p_product
   AND review.form_id = :p_form
   AND review.field_key = item.value:field_key::STRING
   AND review.revision = item.value:revision::NUMBER
   AND EQUAL_NULL(review.current_template_signature, item.value:template::STRING)
  JOIN __DB__.__SCHEMA__.DOCUMENT_V document
    ON document.product_slug = :p_product
   AND document.stage_path = item.value:source_path::STRING
   AND document.is_current
   AND EQUAL_NULL(document.version_key, item.value:source_version::STRING)
  WHERE item.value:attr_key::STRING IS NULL
    AND __DB__.__SCHEMA__.TEXT_VALUE(item.value:value::STRING) IS NOT NULL;
  IF (matched + typed <> requested) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 様式定義・マスター・根拠文書のいずれかが更新されました。再読み込みしてください。',
      'requested',:requested,'matched',:matched + :typed);
  END IF;
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL('field_key',field_key,'record',
      OBJECT_CONSTRUCT_KEEP_NULL('value',value,'state',decision_state,'revision',revision,
        'attr',selected_attr,'master_revision',master_revision,'source_path',source_path,
        'source_version',source_version,'note',source_note)))
    INTO :snapshot
  FROM __DB__.__SCHEMA__.FORM_DECISION
  WHERE product_slug = :p_product AND form_id = :p_form
    AND field_key IN (SELECT item.value:field_key::STRING FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item);
  UPDATE __DB__.__SCHEMA__.FORM_DECISION target SET revision = target.revision + 1
  FROM (SELECT item.value:field_key::STRING AS field_key, item.value:revision::NUMBER AS revision
        FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item) item
  WHERE target.product_slug = :p_product AND target.form_id = :p_form
    AND target.field_key = item.field_key AND target.revision = item.revision;
  bumped := SQLROWCOUNT;
  IF (bumped <> requested) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 他の操作で更新されました。再読み込みしてください。',
      'requested',:requested,'matched',:bumped);
  END IF;
  -- Each item took exactly one path, so the two sets of provenance columns are
  -- mutually exclusive per row: an attribute with its master revision, or a
  -- document with its version. This mirrors what DECIDE_FORM records either way.
  UPDATE __DB__.__SCHEMA__.FORM_DECISION target
  SET value = chosen.value,
      decision_state = 'confirmed',
      selected_attr = chosen.attr_key,
      master_revision = chosen.master_revision,
      source_path = chosen.source_path,
      source_version = chosen.source_version,
      source_note = :p_note,
      template_signature = chosen.template_signature,
      decided_by = CURRENT_USER(),
      decided_at = CURRENT_TIMESTAMP()
  FROM (SELECT item.value:field_key::STRING AS field_key,
          item.value:template::STRING AS template_signature,
          master.attr_key,
          master.revision AS master_revision,
          COALESCE(master.value, __DB__.__SCHEMA__.TEXT_VALUE(item.value:value::STRING)) AS value,
          item.value:source_path::STRING AS source_path,
          item.value:source_version::STRING AS source_version
        FROM TABLE(FLATTEN(input => PARSE_JSON(:p_items))) item
        LEFT JOIN __DB__.__SCHEMA__.MASTER_REVIEW_V master
          ON master.product_slug = :p_product
         AND master.attr_key = item.value:attr_key::STRING
         AND master.revision = item.value:master_revision::NUMBER) chosen
  WHERE target.product_slug = :p_product AND target.form_id = :p_form
    AND target.field_key = chosen.field_key;
  INSERT INTO __DB__.__SCHEMA__.DECISION_HISTORY(event_id,product_slug,scope_id,field_key,action,old_record,new_record,actor)
  SELECT UUID_STRING(),:p_product,:p_form,decision.field_key,'confirm',
    previous.value:record,
    OBJECT_CONSTRUCT_KEEP_NULL('value',decision.value,'state',decision.decision_state,
      'revision',decision.revision,'attr',decision.selected_attr,
      'master_revision',decision.master_revision,'source_path',decision.source_path,
      'source_version',decision.source_version,'note',decision.source_note),
    CURRENT_USER()
  FROM __DB__.__SCHEMA__.FORM_DECISION decision
  JOIN TABLE(FLATTEN(input => :snapshot)) previous
    ON previous.value:field_key::STRING = decision.field_key
  WHERE decision.product_slug = :p_product AND decision.form_id = :p_form;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('confirmed',:requested);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

-- Generated by scripts/layout-review-migration.mjs; records the visual check of one layout version.
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_LAYOUT_REVIEW (
  review_id STRING NOT NULL, layout_id STRING NOT NULL, version STRING NOT NULL,
  form_id STRING NOT NULL, definition_sha256 STRING NOT NULL, note STRING NOT NULL,
  reviewed_by STRING NOT NULL, reviewed_at TIMESTAMP_LTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.REVIEW_LAYOUT(
  p_layout STRING, p_version STRING, p_form STRING, p_hash STRING, p_note STRING, p_consent BOOLEAN)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  matched NUMBER;
  review_id STRING;
BEGIN
  IF (NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 実物の様式と一致することの確認にチェックを入れてください。');
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 照合した内容を記入してください。');
  END IF;
  BEGIN TRANSACTION;
  -- Only from 'pending', and only for the exact definition the reviewer looked at.
  -- A version that is already reviewed is left alone rather than re-stamped, so
  -- the first attestation stays the one on record.
  SELECT COUNT(*) INTO :matched FROM __DB__.__SCHEMA__.FORM_LAYOUT
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='pending';
  IF (matched<>1) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 対象の帳票版が見つからない、既に確認済み、または版が変わりました。再読み込みしてください。');
  END IF;
  review_id := UUID_STRING();
  INSERT INTO __DB__.__SCHEMA__.FORM_LAYOUT_REVIEW(review_id,layout_id,version,form_id,definition_sha256,note,reviewed_by)
  SELECT :review_id,:p_layout,:p_version,:p_form,:p_hash,:p_note,CURRENT_USER();
  UPDATE __DB__.__SCHEMA__.FORM_LAYOUT SET review_status='reviewed_draft'
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='pending';
  IF (SQLROWCOUNT<>1) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 帳票版を更新できませんでした。再読み込みしてください。');
  END IF;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('reviewed',:review_id,'status','reviewed_draft');
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

-- Adoption: the statement that this version may be used for a real submission,
-- printed without the 正式提出不可 marking. It is a heavier claim than the visual
-- check above and it is what SUBMISSION_BLOCKER_V's layout_not_adopted row waits
-- for, so it is kept as its own recorded act with its own text.
--
-- Matched on the definition hash for the same reason the review is: regenerate the
-- layout and the adoption stops applying instead of carrying forward to a
-- definition nobody adopted. A version must already be reviewed_draft, so the
-- visual check can never be skipped by adopting straight away.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.ADOPT_LAYOUT(
  p_layout STRING, p_version STRING, p_form STRING, p_hash STRING,
  p_applicability STRING, p_note STRING, p_consent BOOLEAN)
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  matched NUMBER;
  existing NUMBER;
  approval_id STRING;
BEGIN
  IF (NOT COALESCE(:p_consent,FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 提出用として採用することの確認にチェックを入れてください。');
  END IF;
  IF (__DB__.__SCHEMA__.TEXT_VALUE(:p_applicability) IS NULL OR __DB__.__SCHEMA__.TEXT_VALUE(:p_note) IS NULL) THEN
    RETURN OBJECT_CONSTRUCT('error','エラー: 適用範囲と採用の理由を記入してください。');
  END IF;
  BEGIN TRANSACTION;
  SELECT COUNT(*) INTO :matched FROM __DB__.__SCHEMA__.FORM_LAYOUT
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='reviewed_draft';
  IF (matched<>1) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: 対象の帳票版が見つからない、未照合、または版が変わりました。先に照合を記録してください。');
  END IF;
  SELECT COUNT(*) INTO :existing FROM __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form AND definition_sha256=:p_hash;
  IF (existing>0) THEN
    ROLLBACK;
    RETURN OBJECT_CONSTRUCT('error','エラー: この版は既に採用済みです。');
  END IF;
  approval_id := UUID_STRING();
  INSERT INTO __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL(approval_id,layout_id,version,form_id,definition_sha256,
    applicability,approved_by,note)
  SELECT :approval_id,:p_layout,:p_version,:p_form,:p_hash,:p_applicability,CURRENT_USER(),:p_note;
  COMMIT;
  RETURN OBJECT_CONSTRUCT('approval_id',:approval_id);
EXCEPTION WHEN OTHER THEN
  ROLLBACK;
  RAISE;
END;
$$;

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_SOURCE_FILE (
  sha256 STRING NOT NULL, product_slug STRING NOT NULL, original_filename STRING NOT NULL,
  pages NUMBER NOT NULL, widgets NUMBER NOT NULL, images NUMBER NOT NULL,
  customer_hint STRING, form_id STRING, support_status STRING NOT NULL,
  applicability_status STRING NOT NULL
);

CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL (
  approval_id STRING NOT NULL, layout_id STRING NOT NULL, version STRING NOT NULL,
  form_id STRING NOT NULL, definition_sha256 STRING NOT NULL, applicability STRING NOT NULL,
  approved_by STRING NOT NULL, approved_at TIMESTAMP_LTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  note STRING NOT NULL
);
-- rule: blank_allowed | not_applicable | signature_by_hand. A rule is a recorded
-- human statement about one field of one form, not an extraction result.
CREATE TABLE IF NOT EXISTS __DB__.__SCHEMA__.FORM_FIELD_RULE (
  form_id STRING NOT NULL, field_key STRING NOT NULL, rule STRING NOT NULL,
  reason STRING NOT NULL, confirmed_by STRING NOT NULL,
  confirmed_at TIMESTAMP_LTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY(form_id,field_key)
);
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS render_state STRING;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS output_sha256 STRING;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS output_bytes NUMBER;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS renderer_version STRING;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS font_sha256 STRING;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS approval_id STRING;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMP_LTZ;
ALTER TABLE __DB__.__SCHEMA__.EXPORT_HISTORY ADD COLUMN IF NOT EXISTS rendered_by STRING;

-- Per-form coverage. The source side comes from FORM_SOURCE_FILE, the model side
-- is counted live so the numbers cannot drift from the tables the app reads.
CREATE OR REPLACE VIEW __DB__.__SCHEMA__.FORM_COVERAGE_V AS
WITH template AS (
  SELECT form_id,COUNT(*) AS template_fields,
         COUNT_IF(business_only='true') AS business_only_fields,
         COUNT_IF(field_label RLIKE '.*(押印|署名|印影).*' OR field_label='印（担当部署印）'
                  OR COALESCE(guidance,'') RLIKE '.*(押印|署名).*') AS signature_fields
  FROM __DB__.__SCHEMA__.FORM_TEMPLATE GROUP BY form_id
), mapped AS (
  SELECT form_id,COUNT_IF(attr_key IS NOT NULL) AS mapped_fields FROM __DB__.__SCHEMA__.FORM_ATTR_MAP GROUP BY form_id
), layouts AS (
  SELECT form_id,COUNT(*) AS layout_versions,
         COUNT_IF(review_status='reviewed_draft') AS reviewed_versions
  FROM __DB__.__SCHEMA__.FORM_LAYOUT GROUP BY form_id
), adopted AS (
  SELECT approval.form_id,COUNT(*) AS approved_versions FROM __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL approval
  JOIN __DB__.__SCHEMA__.FORM_LAYOUT layout ON layout.layout_id=approval.layout_id AND layout.version=approval.version
    AND layout.mapping_hash=approval.definition_sha256
  GROUP BY approval.form_id
), sources AS (
  SELECT customer_hint,COUNT(*) AS source_files,SUM(pages) AS source_pages,
         COUNT(DISTINCT sha256) AS source_hashes,
         COUNT_IF(widgets>0) AS files_with_widgets
  FROM __DB__.__SCHEMA__.FORM_SOURCE_FILE GROUP BY customer_hint
)
SELECT form.form_id,form.customer,form.form_name,
       COALESCE(template.template_fields,0) AS template_fields,
       COALESCE(mapped.mapped_fields,0) AS mapped_fields,
       COALESCE(template.business_only_fields,0) AS business_only_fields,
       COALESCE(template.signature_fields,0) AS signature_fields,
       COALESCE(layouts.layout_versions,0) AS layout_versions,
       COALESCE(layouts.reviewed_versions,0) AS reviewed_versions,
       COALESCE(adopted.approved_versions,0) AS approved_versions,
       COALESCE(sources.source_files,0) AS source_files,
       COALESCE(sources.source_pages,0) AS source_pages,
       COALESCE(sources.source_hashes,0) AS source_hashes,
       COALESCE(sources.files_with_widgets,0) AS files_with_widgets,
       'unverified' AS applicability_status
FROM (SELECT DISTINCT form_id,customer,form_name FROM __DB__.__SCHEMA__.FORM_TEMPLATE) form
LEFT JOIN template ON template.form_id=form.form_id
LEFT JOIN mapped ON mapped.form_id=form.form_id
LEFT JOIN layouts ON layouts.form_id=form.form_id
LEFT JOIN adopted ON adopted.form_id=form.form_id
LEFT JOIN sources ON sources.customer_hint=form.customer;

-- One row per remaining reason a submission PDF cannot be produced. field_key is
-- NULL for reasons that concern the whole layout. A layout with no row here and
-- an adoption record is the only thing PREPARE_SUBMISSION_EXPORT will accept.
CREATE OR REPLACE VIEW __DB__.__SCHEMA__.SUBMISSION_BLOCKER_V AS
WITH layout AS (
  SELECT form_layout.layout_id,form_layout.version,form_layout.form_id,
         form_layout.mapping_hash,form_layout.definition,form_layout.review_status,
         product.value::STRING AS product_slug
  FROM __DB__.__SCHEMA__.FORM_LAYOUT form_layout,
       TABLE(FLATTEN(input=>form_layout.definition:products)) product
), adoption AS (
  SELECT layout.layout_id,layout.version,layout.form_id,layout.product_slug,
         COUNT(approval.approval_id) AS approvals
  FROM layout LEFT JOIN __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL approval
    ON approval.layout_id=layout.layout_id AND approval.version=layout.version
   AND approval.form_id=layout.form_id AND approval.definition_sha256=layout.mapping_hash
  GROUP BY 1,2,3,4
), layout_field AS (
  SELECT layout.layout_id,layout.version,layout.form_id,layout.product_slug,
         field.value:key::STRING AS field_key,field.value:label::STRING AS field_label,
         field.value:signature::STRING AS field_signature
  FROM layout,TABLE(FLATTEN(input=>layout.definition:fields)) field
), template AS (
  SELECT form_id,field_key,field_label,business_only,
         (field_label RLIKE '.*(押印|署名|印影).*' OR field_label='印（担当部署印）'
          OR COALESCE(guidance,'') RLIKE '.*(押印|署名).*') AS is_signature
  FROM __DB__.__SCHEMA__.FORM_TEMPLATE
)
SELECT layout.product_slug,layout.form_id,layout.layout_id,layout.version,
       NULL::STRING AS field_key,NULL::STRING AS field_label,
       'layout_not_adopted' AS blocker,'帳票版の採用記録がありません。' AS detail
FROM layout JOIN adoption ON adoption.layout_id=layout.layout_id AND adoption.version=layout.version
  AND adoption.form_id=layout.form_id AND adoption.product_slug=layout.product_slug
WHERE adoption.approvals=0
UNION ALL
SELECT product_slug,form_id,layout_id,version,NULL,NULL,'layout_not_reviewed',
       '帳票版が確認待ちです（review_status=' || review_status || '）。'
FROM layout WHERE review_status<>'reviewed_draft'
UNION ALL
SELECT product_slug,form_id,layout_id,version,field_key,field_label,blocker,detail FROM (
SELECT field.product_slug,field.form_id,field.layout_id,field.version,
       field.field_key,field.field_label,
       CASE
         WHEN reviewed.field_key IS NULL THEN 'field_missing'
         WHEN NOT EQUAL_NULL(reviewed.current_template_signature,field.field_signature) THEN 'field_version_changed'
         WHEN reviewed.status='changed' THEN 'evidence_stale'
         WHEN reviewed.status IN ('test_confirmed','test_skipped') THEN 'test_value_present'
         WHEN reviewed.status='confirmed' THEN NULL
         WHEN rule.rule IS NOT NULL THEN NULL
         WHEN COALESCE(template.is_signature,FALSE) THEN 'signature_pending'
         WHEN reviewed.required THEN 'field_unconfirmed'
         ELSE 'rule_missing'
       END AS blocker,
       CASE
         WHEN reviewed.field_key IS NULL THEN 'この商品の欄が見つかりません。'
         WHEN NOT EQUAL_NULL(reviewed.current_template_signature,field.field_signature) THEN '欄の定義が帳票版と一致しません。'
         WHEN reviewed.status='changed' THEN '根拠が変わったため要再確認です。'
         WHEN reviewed.status IN ('test_confirmed','test_skipped') THEN 'テスト値・入力省略は提出用に使えません。'
         WHEN COALESCE(template.is_signature,FALSE) THEN '押印・署名は自動入力しません。手押印の規則確認が必要です。'
         WHEN reviewed.required THEN '必須欄が未確認です。'
         ELSE '任意欄の空欄は明示的な規則確認が必要です。'
       END AS detail
FROM layout_field field
LEFT JOIN __DB__.__SCHEMA__.FORM_REVIEW_V reviewed ON reviewed.product_slug=field.product_slug
  AND reviewed.form_id=field.form_id AND reviewed.field_key=field.field_key
LEFT JOIN __DB__.__SCHEMA__.FORM_FIELD_RULE rule ON rule.form_id=field.form_id AND rule.field_key=field.field_key
LEFT JOIN template ON template.form_id=field.form_id AND template.field_key=field.field_key
) blocked WHERE blocker IS NOT NULL
UNION ALL
SELECT layout.product_slug,layout.form_id,layout.layout_id,layout.version,
       reviewed.field_key,reviewed.field_label,'field_unmapped',
       'この帳票版では差込未対応の必須欄です。'
FROM layout
JOIN __DB__.__SCHEMA__.FORM_REVIEW_V reviewed ON reviewed.product_slug=layout.product_slug AND reviewed.form_id=layout.form_id
LEFT JOIN layout_field field ON field.layout_id=layout.layout_id AND field.version=layout.version
  AND field.product_slug=layout.product_slug AND field.field_key=reviewed.field_key
LEFT JOIN __DB__.__SCHEMA__.FORM_FIELD_RULE rule ON rule.form_id=reviewed.form_id AND rule.field_key=reviewed.field_key
WHERE field.field_key IS NULL AND reviewed.required AND rule.rule IS NULL;

CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.PREPARE_SUBMISSION_EXPORT(
  p_product STRING,p_form STRING,p_layout STRING,p_version STRING,p_hash STRING)
COPY GRANTS
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  definition VARIANT;
  payload VARIANT;
  blockers VARIANT;
  layout_snapshot VARIANT;
  export_id STRING;
  approval_id STRING;
  matched NUMBER;
  invalid_count NUMBER;
BEGIN
  SELECT COUNT(*),ANY_VALUE(definition) INTO :matched,:definition
  FROM __DB__.__SCHEMA__.FORM_LAYOUT
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form
    AND mapping_hash=:p_hash AND review_status='reviewed_draft';
  IF (matched<>1) THEN RETURN OBJECT_CONSTRUCT('error','指定様式は確認待ち、または版が変わりました。'); END IF;
  IF (NOT COALESCE(ARRAY_CONTAINS(TO_VARIANT(:p_product),definition:products),FALSE)) THEN
    RETURN OBJECT_CONSTRUCT('error','この商品の適用確認がありません。');
  END IF;
  -- The adoption record is matched on the definition hash, so an edited layout
  -- loses its adoption instead of inheriting it.
  SELECT ANY_VALUE(approval_id) INTO :approval_id FROM __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL
  WHERE layout_id=:p_layout AND version=:p_version AND form_id=:p_form AND definition_sha256=:p_hash;
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL('field_key',field_key,'label',field_label,
    'blocker',blocker,'detail',detail)) INTO :blockers
  FROM __DB__.__SCHEMA__.SUBMISSION_BLOCKER_V
  WHERE product_slug=:p_product AND form_id=:p_form AND layout_id=:p_layout AND version=:p_version;
  IF (COALESCE(ARRAY_SIZE(blockers),0)>0 OR approval_id IS NULL) THEN
    RETURN OBJECT_CONSTRUCT('error','提出用の条件を満たしていません。提出前確認を見てください。',
      'blockers',COALESCE(blockers,ARRAY_CONSTRUCT()));
  END IF;
  -- Only confirmed values are ever written into a submission snapshot. There is
  -- no test branch here, unlike PREPARE_LAYOUT_EXPORT.
  SELECT ARRAY_AGG(OBJECT_CONSTRUCT_KEEP_NULL(
    'field_key',field_key,'label',field_label,'section',section,
    'value',IFF(status='confirmed',value,NULL),
    'status',status,'required',required,'source_path',source_path,'source_version',source_version,
    'source_note',source_note,'master_attr',selected_attr,'master_revision',master_revision,
    'master_signature',master_signature,'master_evidence_signature',master_evidence_signature,
    'master_source_path',master_source_path,'revision',revision,'decided_by',decided_by,
    'template_signature',current_template_signature)) WITHIN GROUP (ORDER BY display_order,field_key)
    INTO :payload
  FROM (
    SELECT reviewed.*,master.evidence_signature AS master_evidence_signature,master.source_path AS master_source_path
    FROM __DB__.__SCHEMA__.FORM_REVIEW_V reviewed LEFT JOIN __DB__.__SCHEMA__.MASTER_DECISION master
      ON master.product_slug=reviewed.product_slug AND master.attr_key=reviewed.selected_attr
    WHERE reviewed.product_slug=:p_product AND reviewed.form_id=:p_form
  );
  IF (COALESCE(ARRAY_SIZE(payload),0)=0) THEN RETURN OBJECT_CONSTRUCT('error','対象様式がありません。'); END IF;
  SELECT COUNT(*) INTO :invalid_count FROM (
    SELECT field.index
    FROM TABLE(FLATTEN(input=>:definition:fields)) field
    LEFT JOIN TABLE(FLATTEN(input=>:payload)) snapshot_row
      ON snapshot_row.value:field_key::STRING=field.value:key::STRING
    GROUP BY field.index
    HAVING COUNT(snapshot_row.index)<>1 OR COUNT_IF(EQUAL_NULL(snapshot_row.value:template_signature::STRING,field.value:signature::STRING))<>1
  );
  IF (invalid_count<>0) THEN RETURN OBJECT_CONSTRUCT('error','差込欄の意味・版が一致しません。'); END IF;
  -- Re-checked after the payload is built: the layout version, the adoption and
  -- the blocker set are all read again so a change during preparation cannot be
  -- carried into a submission record.
  SELECT COUNT(*) INTO :matched FROM __DB__.__SCHEMA__.FORM_LAYOUT layout
  JOIN __DB__.__SCHEMA__.FORM_LAYOUT_APPROVAL approval ON approval.layout_id=layout.layout_id
   AND approval.version=layout.version AND approval.form_id=layout.form_id
   AND approval.definition_sha256=layout.mapping_hash
  WHERE layout.layout_id=:p_layout AND layout.version=:p_version AND layout.form_id=:p_form
    AND layout.mapping_hash=:p_hash AND layout.review_status='reviewed_draft'
    AND approval.approval_id=:approval_id;
  IF (matched<>1) THEN RETURN OBJECT_CONSTRUCT('error','生成中に帳票版または採用記録が変更されました。'); END IF;
  SELECT COUNT(*) INTO :invalid_count FROM __DB__.__SCHEMA__.SUBMISSION_BLOCKER_V
  WHERE product_slug=:p_product AND form_id=:p_form AND layout_id=:p_layout AND version=:p_version;
  IF (invalid_count<>0) THEN RETURN OBJECT_CONSTRUCT('error','生成中に提出条件が変わりました。'); END IF;
  export_id := UUID_STRING();
  layout_snapshot := OBJECT_CONSTRUCT('id',p_layout,'version',p_version,'hash',p_hash,'definition',definition);
  INSERT INTO __DB__.__SCHEMA__.EXPORT_HISTORY(export_id,product_slug,form_id,export_kind,rows_snapshot,created_by,
    layout_snapshot,render_state,approval_id)
  SELECT :export_id,:p_product,:p_form,'submission',:payload,CURRENT_USER(),
    :layout_snapshot,'prepared',:approval_id;
  RETURN OBJECT_CONSTRUCT('export_id',export_id,'rows',payload,'kind','submission',
    'approval_id',approval_id,
    'layout',OBJECT_CONSTRUCT('id',p_layout,'version',p_version,'hash',p_hash));
END;
$$;

-- Records the bytes that were actually produced. Only a row this user prepared
-- and still in 'prepared' can be written, so a second call after a double click
-- or a retry cannot produce a second rendered record. A failed render is stored
-- as 'failed' rather than left as prepared, so an incomplete attempt is never
-- presented as a finished output.
CREATE OR REPLACE PROCEDURE __DB__.__SCHEMA__.RECORD_SUBMISSION_RENDER(
  p_export_id STRING,p_state STRING,p_sha256 STRING,p_bytes NUMBER,
  p_renderer STRING,p_font STRING)
COPY GRANTS
RETURNS VARIANT LANGUAGE SQL EXECUTE AS CALLER AS
$$
DECLARE
  updated NUMBER;
BEGIN
  IF (p_state IS NULL OR p_state NOT IN ('rendered','failed')) THEN
    RETURN OBJECT_CONSTRUCT('error','記録する状態を確認してください。');
  END IF;
  IF (p_state='rendered' AND (p_sha256 IS NULL OR p_bytes IS NULL OR p_bytes<=0)) THEN
    RETURN OBJECT_CONSTRUCT('error','出力の実バイト情報がありません。');
  END IF;
  UPDATE __DB__.__SCHEMA__.EXPORT_HISTORY SET render_state=:p_state,output_sha256=:p_sha256,output_bytes=:p_bytes,
    renderer_version=:p_renderer,font_sha256=:p_font,rendered_at=CURRENT_TIMESTAMP(),
    rendered_by=CURRENT_USER()
  WHERE export_id=:p_export_id AND export_kind='submission' AND render_state='prepared'
    AND created_by=CURRENT_USER();
  updated := SQLROWCOUNT;
  IF (updated<>1) THEN
    RETURN OBJECT_CONSTRUCT('error','この出力記録は既に確定しているか、本人の記録ではありません。');
  END IF;
  RETURN OBJECT_CONSTRUCT('export_id',p_export_id,'render_state',p_state,'output_sha256',p_sha256);
END;
$$;

