import { z } from 'zod';

const point = z.number().finite().min(0).max(2000);
const box = { x: point, y: point, width: z.number().positive().max(2000), height: z.number().positive().max(2000) };
export const layoutSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  form: z.string().regex(/^[a-z0-9_]+$/),
  version: z.string().regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1).max(200),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  applicability: z.string().min(1).max(1000),
  products: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(16),
  renderer: z.literal('pdf-lib-1.17.1-sfs-1'),
  pages: z.array(z.object({
    width: z.number().min(200).max(2000), height: z.number().min(200).max(2000),
    labels: z.array(z.object({ ...box, text: z.string().max(1000), size: z.number().min(5).max(30) }).strict()).max(300),
    rules: z.array(z.object(box).strict()).max(300),
  }).strict()).min(1).max(20),
  fields: z.array(z.object({
    ...box, key: z.string().regex(/^[a-z0-9_]+$/), label: z.string().max(200), page: z.number().int().min(0).max(19),
    signature: z.string().regex(/^[a-f0-9]{64}$/), type: z.literal('text'), unit: z.string().max(40),
    size: z.number().min(6).max(16), overflow: z.literal('reject'),
  }).strict()).max(500),
  unsupported: z.array(z.string().max(300)).max(100),
}).strict();

export type LayoutDefinition = z.infer<typeof layoutSchema>;
export interface LayoutSummary {
  layout_id: string; version: string; form_id: string; name: string; mapping_hash: string;
  status: 'pending' | 'reviewed_draft'; applicability: string; unsupported: string[];
}