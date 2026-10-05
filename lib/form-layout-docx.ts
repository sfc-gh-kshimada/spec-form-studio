import { zip, escapeXml } from './exports-docx';
import { layoutIssues } from './form-layout';
import { displayValue, signatureFieldPattern, type ExportSnapshot } from './model';
import type { LayoutDefinition } from './layout-model';

// Word (.docx) rendition of the form itself, not a list of its fields: the same
// page size, the same ruling, the same headings and the same values at the same
// coordinates the PDF prints them at. This is what a reviewer takes to their own
// machine when the remaining edits have to happen in Word.
//
// The layout definition is already positional — pages carry `rules` (rectangles)
// and `labels` (text at a point), and every field has x/y/width/height/size — so
// the two renderers read the same numbers. Anything that changes here and not in
// renderLayout would make the PDF and the Word file disagree about the form, so
// the marking, the seal rule and the footers below are deliberately written to
// match lib/form-layout.ts line for line.
//
// Everything is an absolutely positioned text box anchored to the page, which is
// what keeps the file editable: each heading and each value is a box the reviewer
// can click into. A table grid would be easier to write and would not survive the
// first form whose cells are not a grid.
//
// One difference from the PDF, and it is deliberate: the PDF refuses a value that
// does not fit its box, measured against the embedded font. Word has no such
// measurement available here, and it does not clip — an over-long value spills
// visibly outside its box. In an editable file that is the better failure: it is
// obvious and the reviewer can fix it, where a silent clip would not be.

const EMU = 12700; // per point
const emu = (points: number) => Math.round(points * EMU);
const twips = (points: number) => Math.round(points * 20);

// Word sizes text in half-points, so a 7pt heading is w:sz 14.
const halfPoints = (points: number) => Math.max(2, Math.round(points * 2));

const runFont = '<w:rFonts w:ascii="Yu Gothic" w:hAnsi="Yu Gothic" w:eastAsia="Yu Gothic"/>';

function textBox(id: number, name: string, box: { x: number; y: number; width: number; height: number },
  text: string, size: number) {
  const props = `${runFont}<w:sz w:val="${halfPoints(size)}"/><w:szCs w:val="${halfPoints(size)}"/>`;
  const paragraphs = text.split(/\r?\n/).map(line =>
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${twips(size * 1.4)}" w:lineRule="exact"/>`
    + `<w:rPr>${props}</w:rPr></w:pPr><w:r><w:rPr>${props}</w:rPr>`
    + `<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
  // Insets are zeroed so the text starts at the box origin, as the PDF's
  // drawText does; bodyPr has no autofit so Word never rescales the value.
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${1000 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">
<wp:simplePos x="0" y="0"/>
<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.x)}</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.y)}</wp:posOffset></wp:positionV>
<wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>
<wp:docPr id="${id}" name="${escapeXml(name)}${id}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:cNvPr id="${id}" name="${escapeXml(name)}${id}"/><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>
<wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx>
<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0"/>
</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

// The form's ruling. Drawn as an outlined rectangle with no fill, matching the
// PDF's drawRectangle with a hairline border.
function rectangle(id: number, box: { x: number; y: number; width: number; height: number }) {
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id}" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">
<wp:simplePos x="0" y="0"/>
<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.x)}</wp:posOffset></wp:positionH>
<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.y)}</wp:posOffset></wp:positionV>
<wp:extent cx="${emu(box.width)}" cy="${emu(box.height)}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>
<wp:docPr id="${id}" name="罫線${id}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:cNvPr id="${id}" name="罡線${id}"/><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(box.width)}" cy="${emu(box.height)}"/></a:xfrm>
<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
<a:ln w="6350"><a:solidFill><a:srgbClr val="404040"/></a:solidFill></a:ln></wps:spPr>
<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}

export function renderLayoutDocx(layout: LayoutDefinition, snapshot?: ExportSnapshot) {
  // The same gate the PDF goes through: signatures, template versions, a
  // submission without an adoption record, and test values in a submission are
  // all refused here rather than quietly rendered into an editable file.
  if (snapshot) layoutIssues(layout, snapshot);
  let id = 1;
  const body = layout.pages.map((definition, pageIndex) => {
    const shapes: string[] = [];
    for (const rule of definition.rules) shapes.push(rectangle(id++, rule));
    for (const label of definition.labels) shapes.push(textBox(id++, '見出し', label, label.text, label.size));
    if (snapshot) {
      for (const field of layout.fields.filter(field => field.page === pageIndex)) {
        const row = snapshot.rows.find(row => row.field_key === field.key)!;
        // Seal and signature boxes are left empty in every mode, exactly as in the
        // PDF: the box belongs to the form, the mark is applied by a person.
        if (signatureFieldPattern.test(field.label)) continue;
        const value = displayValue(row, snapshot.kind === 'test_only');
        if (value) shapes.push(textBox(id++, field.label, field, value, field.size));
      }
    }
    if (snapshot?.kind !== 'submission') {
      const notice = snapshot?.kind === 'test_only' ? 'テスト専用・内容未確認・正式提出不可' : '下書き・正式提出不可';
      shapes.push(textBox(id++, '注意書き', { x: 24, y: definition.height - 32, width: definition.width - 48, height: 20 }, notice, 9));
    }
    shapes.push(textBox(id++, '版', { x: 24, y: 20, width: definition.width - 48, height: 12 },
      `${layout.id} / ${layout.version} / ${pageIndex + 1} of ${layout.pages.length}`, 6));
    if (snapshot) shapes.push(textBox(id++, '記録ID', { x: 24, y: 32, width: definition.width - 48, height: 12 }, snapshot.export_id, 6));
    // One paragraph carries every anchor for the page, and a page break separates
    // the pages. Word needs the section size to match the definition or the
    // page-relative offsets land in the wrong place.
    const breakAfter = pageIndex < layout.pages.length - 1
      ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '';
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${shapes.join('')}</w:p>${breakAfter}`;
  }).join('');
  const first = layout.pages[0];
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}`
    + `<w:sectPr><w:pgSz w:w="${twips(first.width)}" w:h="${twips(first.height)}"/>`
    + `<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`
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
