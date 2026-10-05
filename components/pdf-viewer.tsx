"use client";
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { SourceTranscript } from './source-transcript';
import type { Document } from '@/lib/model';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export function PdfViewer({ product, document, reloadKey = 0 }: { product: string; document?: Document; reloadKey?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusEpoch, setFocusEpoch] = useState(0);
  useEffect(() => {
    const revalidate = () => setFocusEpoch(current => current + 1);
    window.addEventListener('focus', revalidate);
    return () => window.removeEventListener('focus', revalidate);
  }, []);
  useEffect(() => {
    setPdf(undefined); setPage(1); setError('');
    if (!document?.is_current || !document.stage_path.endsWith('.pdf')) return;
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    setLoading(true);
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/api/pdfjs/pdf.worker.min.mjs';
      const response = await fetch(`/api/document?${new URLSearchParams({ product, path: document.stage_path, version: document.version_key })}`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json()).error);
      const bytes = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      const task = pdfjs.getDocument({ data: bytes, cMapUrl: '/api/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/api/pdfjs/standard_fonts/', wasmUrl: '/api/pdfjs/wasm/', enableXfa: false });
      dispose = () => { void task.destroy(); };
      const loaded = await task.promise;
      if (!controller.signal.aborted) setPdf(loaded);
    })().catch(problem => { if (!controller.signal.aborted) setError(problem.message || '原本を表示できません。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); dispose?.(); };
  }, [product, document?.stage_path, document?.version_key, document?.is_current, reloadKey, focusEpoch]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let render: RenderTask | undefined;
    let cancelled = false;
    (async () => {
      const sheet = await pdf.getPage(page);
      if (cancelled || !canvas.current) return;
      const viewport = sheet.getViewport({ scale: 1.2 * zoom });
      const surface = canvas.current;
      surface.width = viewport.width; surface.height = viewport.height;
      render = sheet.render({ canvas: surface, viewport });
      await render.promise;
    })().catch(problem => { if (!cancelled && problem.name !== 'RenderingCancelledException') setError('ページを表示できません。'); });
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, page, zoom]);
  if (!document) return <div className="empty-state">この区分の原本は未受領です。</div>;
  if (!document.is_current) return <div className="warning">原本が更新・削除されています。再抽出が必要です。</div>;
  if (!document.stage_path.endsWith('.pdf')) return <SourceTranscript product={product} document={document} reloadKey={reloadKey} />;
  return <div className="pdf-viewer">
    <div className="pdf-toolbar">
      <Button aria-label="前ページ" variant="ghost" size="icon" disabled={!pdf || page === 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
      <span>{page} / {pdf?.numPages ?? '…'}</span>
      <Button aria-label="次ページ" variant="ghost" size="icon" disabled={!pdf || page === pdf.numPages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
      <span className="spacer" />
      <Button aria-label="縮小" variant="ghost" size="icon" disabled={zoom <= .6} onClick={() => setZoom(Math.max(.6, zoom - .2))}><Minus /></Button>
      <span>{Math.round(zoom * 100)}%</span>
      <Button aria-label="拡大" variant="ghost" size="icon" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .2))}><Plus /></Button>
    </div>
    {loading && <div className="empty-state" role="status">原本を取得中…</div>}
    {error && <div className="error" role="alert">{error}</div>}
    <div className="pdf-sheet" aria-busy={loading}><canvas ref={canvas} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} aria-label={`${document.original_filename} ${page}ページ`} hidden={!pdf || !!error} /></div>
  </div>;
}