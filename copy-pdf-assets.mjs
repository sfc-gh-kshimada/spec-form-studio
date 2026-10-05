import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
await mkdir(resolve(root, 'public/pdfjs'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve(root, 'public/pdfjs/pdf.worker.min.mjs'));
// Also copied with a .js name. Inside the deployed app the .mjs file is served
// with a content type Chrome rejects for a module worker ("Failed to fetch
// dynamically imported module"), which then fails again on the fake-worker
// fallback. A .js name is served as text/javascript everywhere.
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve(root, 'public/pdfjs/pdf.worker.min.js'));
for (const asset of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(resolve(root, 'node_modules/pdfjs-dist', asset), resolve(root, 'public/pdfjs', asset), { recursive: true });
}