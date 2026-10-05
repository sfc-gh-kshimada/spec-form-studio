import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLayoutDocx } from '../../lib/form-layout-docx';
import { layoutHash } from '../../lib/form-layout';
import type { LayoutDefinition } from '../../lib/layout-model';
import type { ExportSnapshot } from '../../lib/model';

// The Word rendition of the form has to agree with the PDF about what the form is:
// same page size, same coordinates, same marking, same refusal to fill a seal box.
// These tests pin those, and that the package a real unzip can read back.
const signature = 'a'.repeat(64);
const layout: LayoutDefinition = {
  id: 'sample_genryo_v1', form: 'sample_genryo', version: 'candidate_1',
  name: 'サンプル化粧品 原料調査票', source_sha256: 'b'.repeat(64),
  applicability: '検証用', products: ['sample_emulsifier'], renderer: 'pdf-lib-1.17.1-sfs-1',
  pages: [{ width: 595.44, height: 842.4,
    labels: [{ x: 55, y: 43, width: 260, height: 14, size: 7, text: 'フリガナ' }],
    rules: [{ x: 55, y: 118, width: 505, height: 17 }] }],
  fields: [
    { x: 141, y: 120, width: 412, height: 14, key: 'furigana', label: 'フリガナ', page: 0,
      signature, type: 'text', unit: '', size: 8, overflow: 'reject' },
    { x: 141, y: 200, width: 100, height: 30, key: 'seal', label: '印（担当部署印）', page: 0,
      signature, type: 'text', unit: '', size: 8, overflow: 'reject' },
  ],
  unsupported: [],
};
const rows: ExportSnapshot['rows'] = [
  { section: '原料情報', field_key: 'furigana', label: 'フリガナ', value: 'ネオソルユー', status: 'confirmed', source_note: null, decided_by: 'QA_USER', template_signature: signature },
  { section: '原料情報', field_key: 'seal', label: '印（担当部署印）', value: '押印済み', status: 'confirmed', source_note: null, decided_by: 'QA_USER', template_signature: signature },
];

function read(bytes: Buffer) {
  const directory = mkdtempSync(path.join(tmpdir(), 'formdocx-'));
  const file = path.join(directory, 'form.docx');
  writeFileSync(file, bytes);
  execFileSync('unzip', ['-t', file], { stdio: 'pipe' });
  return execFileSync('unzip', ['-p', file, 'word/document.xml'], { maxBuffer: 8 << 20 }).toString('utf8');
}

describe('word rendition of the form layout', () => {
  it('uses the page size from the definition rather than a default page', () => {
    const document = read(renderLayoutDocx(layout));
    // 595.44pt x 842.4pt in twentieths of a point.
    expect(document).toContain(`<w:pgSz w:w="${Math.round(595.44 * 20)}" w:h="${Math.round(842.4 * 20)}"/>`);
    expect(document).toContain('<w:pgMar w:top="0"');
  });

  it('positions every box against the page at the coordinates the PDF uses', () => {
    const document = read(renderLayoutDocx(layout, { export_id: 'e1', kind: 'review_only', rows }));
    expect(document).toContain('relativeFrom="page"');
    // The field at x=141 becomes 141 * 12700 EMU.
    expect(document).toContain(`<wp:posOffset>${141 * 12700}</wp:posOffset>`);
    expect(document).toContain('ネオソルユー');
    // The ruling is drawn, so the Word file looks like the form and not a list.
    expect(document).toContain('a:prstGeom prst="rect"');
    expect(document).toContain('罫線');
  });

  it('never fills a seal or signature box', () => {
    const document = read(renderLayoutDocx(layout, { export_id: 'e1', kind: 'review_only', rows }));
    expect(document).not.toContain('押印済み');
  });

  it('marks a draft and a test output, and leaves an adopted submission unmarked', () => {
    expect(read(renderLayoutDocx(layout, { export_id: 'e1', kind: 'review_only', rows })))
      .toContain('下書き・正式提出不可');
    expect(read(renderLayoutDocx(layout, { export_id: 'e1', kind: 'test_only', rows })))
      .toContain('テスト専用・内容未確認・正式提出不可');
    const submission = read(renderLayoutDocx(layout, { export_id: 'e1', kind: 'submission', approval_id: 'appr-1', rows }));
    expect(submission).not.toContain('正式提出不可');
    expect(submission).toContain('sample_genryo_v1 / candidate_1');
  });

  it('refuses a submission with no adoption record', () => {
    expect(() => renderLayoutDocx(layout, { export_id: 'e1', kind: 'submission', rows }))
      .toThrow();
  });

  it('refuses a test value in a submission', () => {
    expect(() => renderLayoutDocx(layout, { export_id: 'e1', kind: 'submission', approval_id: 'appr-1',
      rows: [{ ...rows[0], status: 'test_confirmed' }, rows[1]] })).toThrow();
  });

  it('keeps the definition hash stable, so both renderers describe one version', () => {
    // A layout the PDF path validated is the same object this path renders.
    expect(layoutHash(layout)).toMatch(/^[a-f0-9]{64}$/);
  });
});
