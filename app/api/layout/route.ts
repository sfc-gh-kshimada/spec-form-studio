import { z } from 'zod';
import { prefix, query, requireIdentity } from '@/lib/db';
import { AppError, key } from '@/lib/validation';
import { failure, json, privateHeaders } from '@/lib/http';
import { renderLayout, validateLayout } from '@/lib/form-layout';
import { timedRequest } from '@/lib/timing';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return timedRequest(async () => {
    try {
      await requireIdentity();
      const params = new URL(request.url).searchParams;
      const product = key.parse(params.get('product'));
      const form = key.parse(params.get('form'));
      if (!params.has('id')) {
        const layouts = await query(`SELECT layout_id,version,form_id,mapping_hash,definition:name::STRING AS name,review_status AS status,definition:applicability::STRING AS applicability,definition:unsupported AS unsupported FROM ${prefix}.FORM_LAYOUT WHERE form_id=? AND ARRAY_CONTAINS(TO_VARIANT(?),definition:products) ORDER BY layout_id,version`, [form, product]);
        return json(layouts);
      }
      const id = key.parse(params.get('id'));
      const version = z.string().regex(/^[a-z0-9_.-]+$/).max(100).parse(params.get('version'));
      const rows = await query<{ definition: unknown; mapping_hash: string }>(`SELECT definition,mapping_hash FROM ${prefix}.FORM_LAYOUT WHERE layout_id=? AND version=? AND form_id=?`, [id, version, form]);
      if (rows.length !== 1) throw new AppError(404, '帳票版がありません。');
      const layout = validateLayout(rows[0].definition, rows[0].mapping_hash, product, form);
      if (layout.id !== id || layout.version !== version) throw new AppError(409, '帳票の識別子が一致しません。');
      const bytes = await renderLayout(layout);
      return new Response(Buffer.from(bytes), { headers: { ...privateHeaders, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="LAYOUT_REVIEW.pdf"' } });
    } catch (error) { return failure(error); }
  });
}