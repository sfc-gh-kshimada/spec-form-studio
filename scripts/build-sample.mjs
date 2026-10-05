/**
 * Builds the fictional sample that lets a fresh deployment be walked through end
 * to end: one material, one supplier spec sheet (PDF), one customer form and a
 * layout for it. Every name and value here is invented.
 *
 *   node scripts/build-sample.mjs
 *
 * Writes sample/sample-spec_A-100.pdf and setup/03-sample-data.sql. Both are committed,
 * so a deployment does not need to run this; re-run it after editing the data
 * below and commit the result.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sql = value => value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

// ---------------------------------------------------------------- the material
const product = { slug: 'sample_emulsifier', name: 'サンプル乳化剤 A-100' };
const supply = { supplier: 'サンプル商事', submitTo: 'サンプル化粧品' };
const specPath = `${product.slug}/sample-spec_A-100.pdf`;
const specFilename = 'サンプル製品規格書_A-100.pdf';

// Attribute model: key, label, section, order, source kind, note.
const attrs = [
  ['product_name', '商品名', '1. 品名・供給者', 1, 'document', '規格書の記載を一次情報とする'],
  ['maker_name', 'メーカー名', '1. 品名・供給者', 2, 'document', '製造者。仕入先とは別概念'],
  ['supplier_company', '仕入先', '1. 品名・供給者', 3, 'business', '自社の商流マスタが正本'],
  ['inci_name', 'INCI名', '1. 品名・供給者', 4, 'document', ''],
  ['display_name', '表示名称', '1. 品名・供給者', 5, 'document', ''],
  ['standard_basis', '準拠規格', '1. 品名・供給者', 6, 'document', '公定書・自主規格などの区分'],
  ['origin_type', '原料の由来', '2. 由来・原産', 20, 'document', '文書の表現と様式の語彙がずれやすいため必ず人が確認する'],
  ['origin_country', '原産国', '2. 由来・原産', 21, 'document', ''],
  ['law_kashinho', '適用法令:化審法', '3. 適用法令', 30, 'document', ''],
  ['law_shoboho', '適用法令:消防法', '3. 適用法令', 31, 'document', ''],
  ['pack_container', '荷姿', '6. 荷姿・保証期限', 60, 'document', ''],
  ['shelf_life', '品質保証期間', '6. 荷姿・保証期限', 61, 'document', ''],
  ['storage', '保管条件', '6. 荷姿・保証期限', 62, 'document', ''],
  ['appearance', '外観', '9. 参考情報', 90, 'document', ''],
  ['ph_value', 'pH', '9. 参考情報', 91, 'document', ''],
  ['cas_numbers', 'CAS番号', '9. 参考情報', 92, 'document', ''],
  ['ghs_hazard', 'GHS分類', '9. 参考情報', 93, 'document', ''],
];
const alwaysReview = new Set(['origin_type']);

// What the spec sheet says. Printed into the PDF and recorded as its extraction,
// so the candidates the app shows match the document on screen.
const extracted = {
  product_name: 'サンプル乳化剤 A-100',
  maker_name: 'サンプルケミカル工業',
  inci_name: 'Sample Glyceryl Ester (fictional)',
  display_name: 'サンプルグリセリルエステル',
  standard_basis: '自主規格',
  origin_type: '植物由来',
  origin_country: '日本',
  law_kashinho: '既存化学物質（番号は架空）',
  law_shoboho: '非危険物',
  pack_container: 'ポリエチレン袋入り段ボール箱',
  shelf_life: '製造後24ヶ月（未開封）',
  storage: '直射日光を避け、室温で保管',
  appearance: '白色〜淡黄色の固体',
  ph_value: '5.5〜7.5（1%水分散液）',
  cas_numbers: '該当なし（架空の物質）',
  ghs_hazard: '分類対象外',
};

// ---------------------------------------------------------------- the customer form
const form = { id: 'sample_genryo', customer: 'サンプル化粧品', name: '原料調査票' };
const required = '【必須】';
// key, label, section, attr (null = filled by hand), guidance
const fields = [
  ['s001', '原料名', '1. 原料', 'product_name', `供給者の規格書どおりの商品名。${required}`],
  ['s002', 'メーカー名', '1. 原料', 'maker_name', `製造者名。${required}`],
  ['s003', '仕入先', '1. 原料', 'supplier_company', '貴社の購入先。'],
  ['s004', 'INCI名', '1. 原料', 'inci_name', `${required}`],
  ['s005', '表示名称', '1. 原料', 'display_name', `化粧品の全成分表示に用いる名称。${required}`],
  ['s006', '準拠規格', '1. 原料', 'standard_basis', ''],
  ['s007', '由来', '2. 由来', 'origin_type', '植物・動物・鉱物・合成などの区分。'],
  ['s008', '原産国', '2. 由来', 'origin_country', ''],
  ['s009', '化審法', '3. 法規', 'law_kashinho', ''],
  ['s010', '消防法', '3. 法規', 'law_shoboho', ''],
  ['s011', '外観', '4. 性状', 'appearance', ''],
  ['s012', 'pH', '4. 性状', 'ph_value', ''],
  ['s013', '荷姿', '5. 荷姿・保管', 'pack_container', ''],
  ['s014', '品質保証期間', '5. 荷姿・保管', 'shelf_life', `${required}`],
  ['s015', '保管条件', '5. 荷姿・保管', 'storage', ''],
  ['s016', '備考', '6. その他', null, '特記事項があれば記入。'],
  ['s017', '記入日', '6. その他', null, ''],
  ['s018', '担当者印', '6. その他', null, '押印欄。自動入力しない。'],
];
const signature = ([key, label, , attr, guidance]) =>
  // Must equal FORM_FIELD_V.template_signature:
  // SHA2(TO_JSON(ARRAY_CONSTRUCT(form_id, field_key, field_label, guidance, attr_key)), 256)
  sha256(JSON.stringify([form.id, key, label, guidance, attr]));

// ---------------------------------------------------------------- the layout
const layout = {
  id: 'sample_genryo_v1', form: form.id, version: 'candidate_1',
  name: `${form.customer} ${form.name} / 再構成案`,
  source_sha256: sha256(`${form.id}:${form.name}`),
  applicability: 'サンプル用の架空様式。実在の取引先・様式とは関係ありません。',
  products: [product.slug], renderer: 'pdf-lib-1.17.1-sfs-1',
  pages: [{ width: 595.28, height: 841.89, labels: [], rules: [] }], fields: [],
  unsupported: ['担当者印: 自動入力しない'],
};
const page = layout.pages[0];
page.labels.push({ text: `${form.name}`, x: 220, y: 40, width: 160, height: 24, size: 16 });
page.labels.push({ text: `${form.customer} 御中`, x: 50, y: 80, width: 240, height: 16, size: 10 });
let top = 110;
let section = '';
for (const row of fields) {
  const [key, label, rowSection] = row;
  if (rowSection !== section) {
    section = rowSection;
    page.labels.push({ text: section, x: 50, y: top + 4, width: 300, height: 14, size: 9 });
    top += 20;
  }
  const height = key === 's016' ? 48 : 26;
  page.rules.push({ x: 50, y: top, width: 495, height }, { x: 50, y: top, width: 130, height });
  page.labels.push({ text: label, x: 56, y: top + height / 2 - 6, width: 120, height: 14, size: 9 });
  if (key !== 's018') {
    layout.fields.push({ key, label, signature: signature(row), page: 0, x: 186, y: top + 4,
      width: 352, height: height - 8, size: 9, unit: '', type: 'text', overflow: 'reject' });
  }
  top += height;
}
page.labels.push({ text: '※ 本様式はサンプル用の架空様式です。', x: 50, y: top + 14, width: 495, height: 12, size: 7 });
if (top + 30 > page.height) throw new Error('Layout does not fit on one page');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value;
const layoutHash = sha256(JSON.stringify(stable(layout)));
const definition = JSON.stringify(layout);
if (definition.includes('$$')) throw new Error('Unexpected SQL delimiter');

// ---------------------------------------------------------------- the spec PDF
const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
// Embedded whole, like lib/form-layout.ts: @pdf-lib/fontkit's subsetter drops the
// outlines of most CJK glyphs in this font, which leaves the page mostly blank.
const font = await pdf.embedFont(await readFile(resolve(root, 'assets', 'NotoSansJP-Regular.ttf')), { subset: false });
pdf.setTitle('サンプル製品規格書 A-100'); pdf.setAuthor('Spec Form Studio sample');
pdf.setCreationDate(new Date('2026-01-01T00:00:00Z')); pdf.setModificationDate(new Date('2026-01-01T00:00:00Z'));
const sheet = pdf.addPage([595.28, 841.89]);
const text = (value, x, y, size = 10) => sheet.drawText(value, { x, y: 841.89 - y, size, font, color: rgb(0.1, 0.1, 0.1) });
text('製品規格書', 240, 60, 18);
text('サンプルケミカル工業　品質保証部', 330, 90, 9);
text('※ この文書はデモ用の架空資料です。実在の製品・企業とは関係ありません。', 50, 110, 8);
let y = 140;
for (const [key, label] of attrs) {
  if (!(key in extracted)) continue;
  sheet.drawRectangle({ x: 50, y: 841.89 - y - 8, width: 495, height: 24, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
  text(label, 58, y + 1, 9); text(extracted[key], 200, y + 1, 10);
  y += 24;
}
const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
await mkdir(resolve(root, 'sample'), { recursive: true });
await writeFile(resolve(root, 'sample', 'sample-spec_A-100.pdf'), bytes);

// ---------------------------------------------------------------- the seed SQL
const T = name => `__DB__.__SCHEMA__.${name}`;
const values = rows => rows.map(row => `  (${row.map(sql).join(', ')})`).join(',\n');
const out = [];
out.push(`-- 03: fictional sample data. Generated by scripts/build-sample.mjs — edit that, not this.
-- Every name and value is invented. Each INSERT is skipped when the table already has rows,
-- so this never overwrites a model you have loaded yourself.
`);
out.push(`INSERT INTO ${T('ATTR_DEF')} (ATTR_KEY, ATTR_LABEL, SECTION, DISPLAY_ORDER, SOURCE_KIND, PRIMARY_DOC_TYPES, DOC_COVERAGE_PCT, ALWAYS_REVIEW, NOTE)
SELECT $1, $2, $3, $4::NUMBER, $5, PARSE_JSON($6), NULL, $7::BOOLEAN, $8 FROM VALUES
${values(attrs.map(([key, label, sec, order, kind, note]) => [key, label, sec, order, kind, kind === 'document' ? '["spec"]' : '[]', String(alwaysReview.has(key)), note]))}
WHERE NOT EXISTS (SELECT 1 FROM ${T('ATTR_DEF')});
`);
out.push(`INSERT INTO ${T('ATTR_SOURCE_MAP')} (EXTRACT_KEY, ATTR_KEY, DOC_TYPE, IS_PRIMARY)
SELECT $1, $2, $3, $4::BOOLEAN FROM VALUES
${values(attrs.filter(([, , , , kind]) => kind === 'document').map(([key]) => [key, key, 'spec', 'true']))}
WHERE NOT EXISTS (SELECT 1 FROM ${T('ATTR_SOURCE_MAP')});
`);
out.push(`INSERT INTO ${T('PRODUCT')} (PRODUCT_SLUG, PRODUCT_NAME, N_DOCS)
SELECT $1, $2, $3::NUMBER FROM VALUES
${values([[product.slug, product.name, '1']])}
WHERE NOT EXISTS (SELECT 1 FROM ${T('PRODUCT')});
`);
out.push(`INSERT INTO ${T('PRODUCT_SUPPLY')} (PRODUCT_SLUG, PRODUCT_NAME_SRC, SUPPLIER_COMPANY, SUBMIT_TO, N_INPUT_DOCS, HAS_DOCUMENTS, N_OUTPUT_DOCS, HAS_OUTPUT_SAMPLE)
SELECT $1, $2, $3, $4, $5::NUMBER, $6::BOOLEAN, $7::NUMBER, $8::BOOLEAN FROM VALUES
${values([[product.slug, product.name, supply.supplier, supply.submitTo, '1', 'true', '0', 'false']])}
WHERE NOT EXISTS (SELECT 1 FROM ${T('PRODUCT_SUPPLY')});
`);
out.push(`INSERT INTO ${T('FORM_TEMPLATE')} (FORM_ID, CUSTOMER, FORM_NAME, FIELD_KEY, FIELD_LABEL, GUIDANCE, BUSINESS_ONLY, DISPLAY_ORDER, SECTION)
SELECT $1, $2, $3, $4, $5, $6, $7::BOOLEAN, $8::NUMBER, $9 FROM VALUES
${values(fields.map(([key, label, sec, attr, guidance], index) => [form.id, form.customer, form.name, key, label, guidance, String(attr === null), String((index + 1) * 10), sec]))}
WHERE NOT EXISTS (SELECT 1 FROM ${T('FORM_TEMPLATE')});
`);
out.push(`INSERT INTO ${T('FORM_ATTR_MAP')} (FORM_ID, FIELD_KEY, ATTR_KEY)
SELECT $1, $2, $3 FROM VALUES
${values(fields.map(([key, , , attr]) => [form.id, key, attr]))}
WHERE NOT EXISTS (SELECT 1 FROM ${T('FORM_ATTR_MAP')});
`);
out.push(`INSERT INTO ${T('CUSTOMER_FORM_MAP')} (SUBMIT_TO, FORM_ID, NOTE)
SELECT $1, $2, $3 FROM VALUES
${values([[supply.submitTo, form.id, 'サンプル']])}
WHERE NOT EXISTS (SELECT 1 FROM ${T('CUSTOMER_FORM_MAP')});
`);
out.push(`-- Inserted as 'pending': it prints a blank form for review and refuses to produce a
-- valued PDF until someone records, in the app, that it matches the real form.
INSERT INTO ${T('FORM_LAYOUT')} (LAYOUT_ID, VERSION, FORM_ID, MAPPING_HASH, DEFINITION, REVIEW_STATUS)
SELECT '${layout.id}', '${layout.version}', '${layout.form}', '${layoutHash}', PARSE_JSON($$${definition}$$), 'pending'
WHERE NOT EXISTS (SELECT 1 FROM ${T('FORM_LAYOUT')} WHERE layout_id = '${layout.id}' AND version = '${layout.version}');
`);
out.push(`-- The spec sheet. scripts/setup.sh uploads sample/sample-spec_A-100.pdf to @RAW/${product.slug}/ before this
-- file runs; the extraction below is what that PDF says.
ALTER STAGE ${T('RAW')} REFRESH;
INSERT INTO ${T('DOC_REGISTRY')} (STAGE_PATH, PRODUCT, PRODUCT_SLUG, DOC_ROLE, DOC_TYPE, EXT, SIZE_BYTES, ORIGINAL_FILENAME, SHA256, SUBMIT_TO, UPLOAD_PURPOSE)
SELECT ${[specPath, product.name, product.slug, 'input', 'spec', 'pdf'].map(sql).join(', ')}, ${bytes.length}, ${sql(specFilename)}, '${sha256(bytes)}', NULL, 'production'
WHERE NOT EXISTS (SELECT 1 FROM ${T('DOC_REGISTRY')} WHERE stage_path = ${sql(specPath)});
INSERT INTO ${T('DOC_CLASSIFIED')} (STAGE_PATH, PRODUCT_SLUG, ORIGINAL_FILENAME, DOC_TYPE_FILENAME, DOC_KIND, DOC_TITLE, HAS_LOT, DOC_KIND_SCORE, ERR)
SELECT ${[specPath, product.slug, specFilename, 'spec', 'spec', '製品規格書', 'false'].map(sql).join(', ')}, 1.0, NULL
WHERE NOT EXISTS (SELECT 1 FROM ${T('DOC_CLASSIFIED')} WHERE stage_path = ${sql(specPath)});
INSERT INTO ${T('DOC_EXTRACT')} (STAGE_PATH, PRODUCT_SLUG, DOC_TYPE, EXTRACTED, SCORES, ERR)
SELECT ${sql(specPath)}, ${sql(product.slug)}, 'spec', PARSE_JSON($$${JSON.stringify(extracted)}$$), NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM ${T('DOC_EXTRACT')} WHERE stage_path = ${sql(specPath)});
-- DOC_VERSION records the bytes the extraction was made from. It is captured from the
-- stage itself, so a later edit of the PDF on the stage shows up as "原本が更新".
INSERT INTO ${T('DOC_VERSION')} (STAGE_PATH, MD5, SIZE_BYTES, LAST_MODIFIED, CAPTURED_AT)
SELECT relative_path, md5, size, last_modified, CURRENT_TIMESTAMP() FROM DIRECTORY(@${T('RAW')})
WHERE relative_path = ${sql(specPath)}
  AND NOT EXISTS (SELECT 1 FROM ${T('DOC_VERSION')} WHERE stage_path = ${sql(specPath)});
`);
out.push(`-- One row per decidable cell. Derived from the tables above, not content.
INSERT INTO ${T('MASTER_DECISION')} (product_slug, attr_key)
SELECT p.product_slug, a.attr_key FROM ${T('PRODUCT')} p CROSS JOIN ${T('ATTR_DEF')} a
WHERE NOT EXISTS (SELECT 1 FROM ${T('MASTER_DECISION')} d WHERE d.product_slug = p.product_slug AND d.attr_key = a.attr_key);
INSERT INTO ${T('FORM_DECISION')} (product_slug, form_id, field_key)
SELECT p.product_slug, t.form_id, t.field_key FROM ${T('PRODUCT')} p CROSS JOIN ${T('FORM_TEMPLATE')} t
WHERE NOT EXISTS (SELECT 1 FROM ${T('FORM_DECISION')} d WHERE d.product_slug = p.product_slug AND d.form_id = t.form_id AND d.field_key = t.field_key);
`);
await writeFile(resolve(root, 'setup', '03-sample-data.sql'), out.join('\n'));
await writeFile(resolve(root, 'sample', 'sample-layout.json'), JSON.stringify(layout, null, 2) + '\n');
console.log(JSON.stringify({ pdf_bytes: bytes.length, layout_hash: layoutHash, fields: layout.fields.length, stage_path: specPath }));
