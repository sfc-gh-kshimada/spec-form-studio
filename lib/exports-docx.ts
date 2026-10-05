import { deflateRawSync } from 'node:zlib';
import { displayValue, type ExportSnapshot, type State } from './model';

// Word (.docx) rendition of one export record, so a reviewer can take the filled
// form to their own machine and edit it. Server-only: it uses node:zlib, and
// lib/exports.ts stays the shared module the browser can import.
//
// This is deliberately not a visual copy of the customer's form. Reproducing the
// printed layout in Word would look like the real thing while being a
// reconstruction, and the PDF path already exists for the layout. What this
// produces is the field list as an editable table, carrying the same marking the
// PDF carries, so nothing here can be mistaken for an approved submission.
//
// No dependency is added for this. A .docx is a ZIP of three XML parts, and the
// store/deflate writer below is smaller than the surface a document library would
// bring in.

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value;
  }
  return table;
})();

function crc32(data: Buffer) {
  let crc = -1;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

// Minimal ZIP writer: one deflated entry per part, then the central directory.
// No ZIP64 and no data descriptors — a .docx of one form is kilobytes.
// Exported because the layout-shaped Word output builds its own document.xml and
// needs the same container.
export function zip(files: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22); local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(0, 36); entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!))
  // Control characters are not representable in XML 1.0 and would make Word
  // report the file as corrupt rather than skip them.
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const docxStatus = (status: State, test: boolean) => status === 'test_skipped' ? 'テスト入力省略・値未提供'
  : status === 'confirmed' ? '確認済み'
  : status === 'test_confirmed' && test ? 'テスト確定・内容未確認' : '未確認・出力対象外';

// eastAsia is set explicitly: without it Word picks a Latin default for the run
// and Japanese text can fall back to a substituted font.
const runProps = (bold: boolean, size = 20) =>
  `<w:rPr><w:rFonts w:ascii="Yu Gothic" w:hAnsi="Yu Gothic" w:eastAsia="Yu Gothic"/>`
  + `${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr>`;

const paragraph = (text: string, { bold = false, size = 20 } = {}) =>
  `<w:p><w:pPr>${runProps(bold, size)}</w:pPr><w:r>${runProps(bold, size)}`
  + `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

const cell = (text: string, { bold = false, width = 2000 } = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(text, { bold, size: 18 })}</w:tc>`;

export function exportDocx(snapshot: ExportSnapshot, productName: string, formName: string,
  layout?: { id: string; version: string }) {
  const test = snapshot.kind === 'test_only';
  const submission = snapshot.kind === 'submission';
  // Same wording as the PDF and the HTML sheet, and dropped for the same reason:
  // only an adopted submission prints without it. renderLayout applies the same
  // rule, so the two formats of one record never disagree about what it is.
  const notice = submission ? '提出用。採用済みの帳票版から作成しました。'
    : test
    ? 'テスト専用・内容未確認・正式提出不可。値未提供の欄は実値ではありません。'
    : '下書き・正式提出不可。確認済みの値だけを掲載します。';
  const columns = ['区分', '項目', test ? 'テスト値・正式提出不可' : '確認済み値', '状態', '出所'];
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>`
    + columns.map((label, index) => cell(label, { bold: true, width: index === 1 ? 3200 : 2000 })).join('')
    + `</w:tr>`;
  const body = snapshot.rows.map(row => `<w:tr>`
    + cell(row.section ?? '', { width: 2000 })
    + cell(row.label, { width: 3200 })
    + cell(displayValue(row, test), { width: 2000 })
    + cell(docxStatus(row.status, test), { width: 2000 })
    + cell(row.source_note ?? '', { width: 2000 })
    + `</w:tr>`).join('');
  const borders = '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(edge => `<w:${edge} w:val="single" w:sz="4" w:color="A9B6C4"/>`).join('')
    + '</w:tblBorders>';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
    + paragraph(`${productName} / ${formName}`, { bold: true, size: 28 })
    + paragraph(notice, { bold: true })
    + paragraph(`記録ID: ${snapshot.export_id}`, { size: 16 })
    + (submission && snapshot.approval_id ? paragraph(`採用記録: ${snapshot.approval_id}`, { size: 16 }) : '')
    + (layout ? paragraph(`帳票版: ${layout.id} / ${layout.version}`, { size: 16 }) : '')
    + `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${header}${body}</w:tbl>`
    + paragraph(submission
      ? 'この表を手元で編集して提出してください。編集後の内容はこの記録には反映されません。'
      : 'この表を手元で編集してください。編集後の内容はこの記録には反映されません。', { size: 16 })
    + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>`
    + `</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}
