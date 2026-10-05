import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../lib/exports-docx';
import type { ExportSnapshot } from '../../lib/model';

// The ZIP container is hand-written, so the test that matters is whether a real
// unzip can read every part back. A .docx that only looks right in the debugger is
// worthless: Word reports it as corrupt and the reviewer cannot edit anything.
const snapshot: ExportSnapshot = {
  export_id: '11111111-2222-3333-4444-555555555555',
  kind: 'test_only',
  rows: [
    { section: '原料情報', field_key: 'maker_name', label: '製造者名', value: 'テスト製造者', status: 'test_confirmed', source_note: 'テスト値', decided_by: 'QA_USER' },
    { section: '原料情報', field_key: 'banned', label: '使用禁止物質', value: null, status: 'test_skipped', source_note: null, decided_by: null },
  ],
};

function unzip(bytes: Buffer) {
  const directory = mkdtempSync(path.join(tmpdir(), 'docx-'));
  const file = path.join(directory, 'out.docx');
  writeFileSync(file, bytes);
  // -t verifies every CRC, so a wrong length or checksum fails here rather than
  // silently producing a file Word refuses.
  execFileSync('unzip', ['-t', file], { stdio: 'pipe' });
  // unzip treats the member name as a glob, so the brackets in
  // [Content_Types].xml have to be escaped or it matches nothing.
  return (name: string) => execFileSync('unzip', ['-p', file, name.replace(/[[\]]/g, char => `\\${char}`)], { maxBuffer: 8 << 20 }).toString('utf8');
}

describe('word export', () => {
  const bytes = exportDocx(snapshot, 'sample_emulsifier', 'サンプル化粧品 原料調査票', { id: 'sample_genryo_v1', version: 'candidate_1' });
  const read = unzip(bytes);

  it('produces a readable package with the three required parts', () => {
    expect(read('[Content_Types].xml')).toContain('wordprocessingml.document.main+xml');
    expect(read('_rels/.rels')).toContain('word/document.xml');
    expect(read('word/document.xml')).toContain('<w:body>');
  });

  it('carries the same non-submission marking the PDF carries', () => {
    // A Word file is the easiest output to edit and forward, so the marking has to
    // be inside the document, not only in the filename.
    expect(read('word/document.xml')).toContain('テスト専用・内容未確認・正式提出不可');
  });

  it('never presents a skipped field as a value', () => {
    const document = read('word/document.xml');
    expect(document).toContain('テスト入力省略・値未提供');
    expect(document).not.toContain('使用禁止物質</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:rPr><w:rFonts w:ascii="Yu Gothic" w:hAnsi="Yu Gothic" w:eastAsia="Yu Gothic"/><w:sz w:val="18"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Yu Gothic" w:hAnsi="Yu Gothic" w:eastAsia="Yu Gothic"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">テスト製造者');
  });

  it('names the layout version it was produced from', () => {
    expect(read('word/document.xml')).toContain('sample_genryo_v1 / candidate_1');
  });

  it('escapes markup so a value cannot break the document', () => {
    const risky = exportDocx({ ...snapshot, kind: 'review_only',
      rows: [{ section: '<b>', field_key: 'x', label: 'A & B', value: '</w:t>', status: 'confirmed', source_note: null, decided_by: null }] },
      'p', 'f');
    const document = unzip(risky)('word/document.xml');
    expect(document).toContain('A &amp; B');
    expect(document).not.toContain('<b>');
    expect(document).toContain('下書き・正式提出不可');
  });

  it('drops the marking only for an adopted submission, and names the adoption', () => {
    // Mirrors renderLayout: the two formats of one record must not disagree about
    // whether the record is submission-grade.
    const document = unzip(exportDocx({ ...snapshot, kind: 'submission', approval_id: 'appr-1',
      rows: [{ section: '原料情報', field_key: 'maker_name', label: '製造者名', value: '製造者', status: 'confirmed', source_note: null, decided_by: 'QA_USER' }] },
      'sample_emulsifier', 'サンプル化粧品 原料調査票'))('word/document.xml');
    expect(document).not.toContain('正式提出不可');
    expect(document).toContain('採用記録: appr-1');
    expect(document).toContain('製造者');
  });
});
