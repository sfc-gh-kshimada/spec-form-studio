import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { layoutSchema, type LayoutDefinition } from './layout-model';
import { displayValue, signatureFieldPattern, type ExportSnapshot } from './model';
import { AppError } from './validation';

export const fontSha256 = 'd3f69013f5a411101fbd9b895db9996f9149718ec4811c01c4cae18ca182ee69';

export function layoutHash(layout: LayoutDefinition): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, stable(entry)])) : value;
  return createHash('sha256').update(JSON.stringify(stable(layout))).digest('hex');
}

export function validateLayout(raw: unknown, hash: string, product: string, form: string): LayoutDefinition {
  const layout = layoutSchema.parse(raw);
  if (layoutHash(layout) !== hash || !layout.products.includes(product) || layout.form !== form) throw new AppError(409, '帳票の版・対象が一致しません。');
  if (new Set(layout.fields.map(field => field.key)).size !== layout.fields.length) throw new AppError(409, '差込欄が重複しています。');
  for (const [pageIndex, page] of layout.pages.entries()) {
    for (const box of [...page.labels, ...page.rules, ...layout.fields.filter(field => field.page === pageIndex)]) {
      if (box.x + box.width > page.width || box.y + box.height > page.height) throw new AppError(409, '印字範囲がページ外です。');
    }
  }
  if (layout.fields.some(field => !layout.pages[field.page])) throw new AppError(409, '差込ページがありません。');
  return layout;
}

export function layoutIssues(layout: LayoutDefinition, snapshot: ExportSnapshot): string[] {
  const rows = new Map(snapshot.rows.map(row => [row.field_key, row]));
  if (rows.size !== snapshot.rows.length) throw new AppError(409, '出力欄が重複しています。');
  // A submission render is only reachable through a recorded adoption, and it
  // never carries a test value. Both are checked in SQL before the record is
  // created; they are re-checked here because this is the function that decides
  // whether the draft marking is printed.
  if (snapshot.kind === 'submission') {
    if (!snapshot.approval_id) throw new AppError(409, '帳票版の採用記録がないため提出用は出力できません。');
    const test = snapshot.rows.find(row => row.status === 'test_confirmed' || row.status === 'test_skipped');
    if (test) throw new AppError(409, `テスト値は提出用に含められません: ${test.label}`);
  }
  const issues = [...layout.unsupported];
  for (const field of layout.fields) {
    const row = rows.get(field.key);
    if (!row || row.template_signature !== field.signature) throw new AppError(409, `欄定義が一致しません: ${field.label}`);
    if (!displayValue(row, snapshot.kind === 'test_only')) issues.push(`${field.label}: 未確認・未提供`);
  }
  const mapped = new Set(layout.fields.map(field => field.key));
  for (const row of snapshot.rows) if (!mapped.has(row.field_key)) issues.push(`${row.label}: この版では差込未対応`);
  return issues;
}

export async function renderLayout(layout: LayoutDefinition, snapshot?: ExportSnapshot): Promise<Uint8Array> {
  if (snapshot) layoutIssues(layout, snapshot);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await readFile(join(process.cwd(), 'assets', 'NotoSansJP-Regular.ttf'));
  if (createHash('sha256').update(fontBytes).digest('hex') !== fontSha256) throw new AppError(409, '描画フォントの版が一致しません。');
  // The font is embedded whole. @pdf-lib/fontkit's subsetter drops the outlines of
  // most CJK glyphs: the text still extracts and the advance widths are still right,
  // so every text-based check passes while the printed form is unreadable. Measured
  // on this layout, subsetting produced a 43KB PDF in which 下書き・正式提出不可
  // rendered as き 正 不可. Embedding the whole font costs about 3.4MB per PDF and is
  // the only option that prints what the form says it prints.
  const font = await pdf.embedFont(fontBytes, { subset: false });
  const charset = new Set(font.getCharacterSet());
  pdf.setTitle(snapshot?.kind === 'submission'
    ? `${layout.name} / ${layout.id} ${layout.version}`
    : `${layout.name} / 下書き・正式提出不可`);
  pdf.setAuthor(''); pdf.setSubject(''); pdf.setKeywords([]);
  pdf.setCreator(layout.renderer); pdf.setProducer(layout.renderer);
  pdf.setCreationDate(new Date('2026-09-16T00:00:00Z')); pdf.setModificationDate(new Date('2026-09-16T00:00:00Z'));
  for (const [pageIndex, definition] of layout.pages.entries()) {
    const page = pdf.addPage([definition.width, definition.height]);
    function write(text: string, box: { x: number; y: number; width: number; height: number; size: number }, label: string) {
      const lines: string[] = [];
      for (const paragraph of text.split(/\r?\n/)) {
        let line = '';
        for (const character of paragraph) {
          if (!charset.has(character.codePointAt(0)!)) throw new AppError(422, `表示できない文字があります: ${label}`);
          if (font.widthOfTextAtSize(line + character, box.size) > box.width) { lines.push(line); line = ''; }
          if (font.widthOfTextAtSize(character, box.size) > box.width) throw new AppError(422, `文字が欄幅を超えます: ${label}`);
          line += character;
        }
        lines.push(line);
      }
      const lineHeight = box.size * 1.4;
      if (lines.length * lineHeight > box.height) throw new AppError(422, `文字が欄に収まりません: ${label}`);
      lines.forEach((line, index) => page.drawText(line, { x: box.x, y: definition.height - box.y - box.size - index * lineHeight, size: box.size, font, color: rgb(.08, .08, .08) }));
    }
    for (const rule of definition.rules) page.drawRectangle({ x: rule.x, y: definition.height - rule.y - rule.height, width: rule.width, height: rule.height, borderWidth: .45, borderColor: rgb(.25, .25, .25) });
    for (const label of definition.labels) write(label.text, label, '様式ラベル');
    if (snapshot) {
      for (const field of layout.fields.filter(field => field.page === pageIndex)) {
        const row = snapshot.rows.find(row => row.field_key === field.key)!;
        // Seal and signature boxes are left empty in every mode: the box is drawn
        // by the layout, the mark is applied by a person on the printed form.
        if (signatureFieldPattern.test(field.label)) continue;
        write(displayValue(row, snapshot.kind === 'test_only'), field, field.label);
      }
    }
    // The draft marking is dropped only for an adopted submission. layoutIssues
    // has already refused a submission without an adoption record, so there is no
    // path that reaches an unmarked page without one.
    if (snapshot?.kind !== 'submission') {
      const notice = snapshot?.kind === 'test_only' ? 'テスト専用・内容未確認・正式提出不可' : '下書き・正式提出不可';
      write(notice, { x: 24, y: 12, width: definition.width - 48, height: 20, size: 9 }, '注意書き');
    }
    write(`${layout.id} / ${layout.version} / ${pageIndex + 1} of ${layout.pages.length}`, { x: 24, y: definition.height - 34, width: definition.width - 48, height: 12, size: 6 }, '版');
    if (snapshot) write(snapshot.export_id, { x: 24, y: definition.height - 22, width: definition.width - 48, height: 12, size: 6 }, '記録ID');
  }
  return pdf.save();
}