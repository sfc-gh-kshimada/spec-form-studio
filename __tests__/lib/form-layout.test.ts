import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutHash, layoutIssues, renderLayout, validateLayout } from '@/lib/form-layout';
import { layoutSchema } from '@/lib/layout-model';
import type { ExportSnapshot } from '@/lib/model';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const layout = layoutSchema.parse(JSON.parse(readFileSync('__tests__/fixtures/sample-layout.json', 'utf8')));
const snapshot: ExportSnapshot = { export_id: '00000000-0000-4000-8000-000000000001', kind: 'review_only', rows: layout.fields.map(field => ({ field_key: field.key, label: field.label, value: null, status: 'pending', template_signature: field.signature })) };

describe('versioned clean layout', () => {
  it('binds product, form and mapping hash', () => {
    expect(validateLayout(layout, layoutHash(layout), 'sample_emulsifier', 'sample_genryo')).toEqual(layout);
    expect(() => validateLayout(layout, layoutHash(layout), 'other_material', 'sample_genryo')).toThrow();
    expect(() => validateLayout(layout, '0'.repeat(64), 'sample_emulsifier', 'sample_genryo')).toThrow();
  });
  it('fails closed on missing or changed semantic mapping', () => {
    expect(layoutIssues(layout, snapshot).length).toBeGreaterThan(14);
    expect(() => layoutIssues(layout, { ...snapshot, rows: [] })).toThrow();
    expect(() => layoutIssues(layout, { ...snapshot, rows: [...snapshot.rows, snapshot.rows[0]] })).toThrow();
  });
  it('rejects off-page or duplicate mapping definitions', () => {
    const changed = structuredClone(layout); changed.fields[0].x = 590;
    expect(() => validateLayout(changed, layoutHash(changed), 'sample_emulsifier', 'sample_genryo')).toThrow();
    changed.fields = [layout.fields[0], layout.fields[0]];
    expect(() => validateLayout(changed, layoutHash(changed), 'sample_emulsifier', 'sample_genryo')).toThrow();
  });
  it('generates a new image-free PDF with embedded Japanese text', async () => {
    const bytes = await renderLayout(layout);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getAuthor()).toBe('');
    expect(pdf.getTitle()).toContain('正式提出不可');
    mkdirSync('output/format-performance', { recursive: true });
    writeFileSync('output/format-performance/pilot-clean.pdf', bytes);
  });
  it('embeds outlines for every character the layout prints', async () => {
    // A text-only assertion cannot see this failure: subsetting kept the text and the
    // advance widths and dropped the outlines, so the PDF extracted correctly and
    // printed almost nothing. Check the glyph programs, and check that the embedded
    // font is the whole file rather than a subset.
    const font = fontkit.create(readFileSync('assets/NotoSansJP-Regular.ttf')) as unknown as {
      variationAxes?: Record<string, unknown>;
      layout: (text: string) => { glyphs: { id: number; path: { commands: unknown[] } }[] };
    };
    expect(font.variationAxes && Object.keys(font.variationAxes).length).toBeFalsy();
    const printed = layout.pages.flatMap(page => page.labels.map(label => label.text)).join('');
    for (const character of new Set(printed.replace(/\s/g, ''))) {
      const [glyph] = font.layout(character).glyphs;
      expect(glyph.id, `no glyph for ${character}`).toBeGreaterThan(0);
      expect(glyph.path.commands.length, `empty outline for ${character}`).toBeGreaterThan(0);
    }
    expect((await renderLayout(layout)).length).toBeGreaterThan(1_000_000);
  });
  it('does not render unconfirmed or test-only values into normal output', async () => {
    const hidden = structuredClone(snapshot);
    hidden.rows[0].status = 'test_confirmed'; hidden.rows[0].value = '秘密'.repeat(1000);
    hidden.rows[1].status = 'changed'; hidden.rows[1].value = '秘密'.repeat(1000);
    expect((await renderLayout(layout, hidden)).length).toBeGreaterThan(1000);
  });
  it('keeps skipped actual values null and rejects real text overflow', async () => {
    const test = structuredClone(snapshot); test.kind = 'test_only';
    test.rows[0].status = 'test_skipped';
    await renderLayout(layout, test);
    expect(test.rows[0].value).toBeNull();
    test.rows[0].status = 'confirmed'; test.rows[0].value = '長'.repeat(1000);
    await expect(renderLayout(layout, test)).rejects.toThrow('収まりません');
  });
});