// `output: "standalone"` is required for Docker/SPCS deployment.
// `images.unoptimized` avoids needing the sharp package.
//
// `turbopack.root` and `outputFileTracingRoot` are pinned to this app's
// own directory because Next.js 16 + Turbopack walks upward looking for
// a lockfile and silently re-roots the project if it finds one in a
// parent directory. Symptoms when this re-roots are nasty: `/` returns
// 404, chunk URLs contain the wrong path prefix, and
// `outputFileTracingRoot` is wrong at deploy time. Keeping these
// pinned to `__dirname` is the only reliable fix; do NOT remove them
// when adding new config.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  distDir: process.env.SFS_QA_BUILD === '1' ? '.next-qa' : '.next',
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: { '/api/layout': ['./assets/*'], '/api/export': ['./assets/*'],
    '/api/submission': ['./assets/*'], '/api/pdfjs/[...file]': ['./public/pdfjs/**'] },
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['snowflake-sdk'],
  images: {
    unoptimized: true,
  },
  // The pdf.js worker is a module script. Served from the standalone server the
  // .mjs extension can arrive with a content type Chrome refuses for a module
  // worker, so the type is stated here for both names.
  async headers() {
    return [{ source: '/pdfjs/:file*.(mjs|js)', headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }] }];
  },
}

export default nextConfig
