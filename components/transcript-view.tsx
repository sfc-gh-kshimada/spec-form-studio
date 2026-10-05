"use client";
import { ScrollText } from 'lucide-react';

export type TranscriptPage = { page_index: number; content: string | null };

// Shows every page of what AI_PARSE_DOCUMENT read, in reading order. This is the
// AI's transcription, not a confirmed value: it exists so a person can compare it
// against the original before anything is decided.
export function TranscriptView({ pages, cached, elapsed, source, mode }: {
  pages: TranscriptPage[]; cached?: boolean; elapsed?: number; source?: string; mode?: string;
}) {
  const characters = pages.reduce((total, page) => total + (page.content?.length ?? 0), 0);
  if (!pages.length) return <p className="warning">文字起こしの結果がありません。</p>;
  return <div className="transcript">
    <p className="muted"><ScrollText size={13} /> 全{pages.length}ページ / {characters.toLocaleString('ja-JP')}文字
      {mode ? ` / ${mode}モード` : ''}
      {cached ? '（保存済みを表示）' : elapsed !== undefined ? `（${Math.round(elapsed / 1000)}秒）` : ''}
      {source ? ` / 変換後: ${source}` : ''}</p>
    <div className="transcript-scroll">
      {pages.map(page => <section key={page.page_index}>
        <small>ページ {page.page_index + 1}</small>
        <pre>{page.content?.trim() || '（このページに文字はありません）'}</pre>
      </section>)}
    </div>
    <p className="muted">AIが読み取った内容です。確定値ではありません。原本と照合してください。</p>
  </div>;
}
