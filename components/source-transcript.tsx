"use client";
import { useData } from '@/lib/client';
import { TranscriptView, type TranscriptPage } from './transcript-view';
import type { Document } from '@/lib/model';

type Row = TranscriptPage & { page_count: number | null; parsed_at: string | null };

// Evidence that is not a PDF cannot be drawn in the viewer, so the stored
// transcription is shown instead. Nothing is transcribed from here: this only
// reads what a previous explicit request already stored.
export function SourceTranscript({ product, document, reloadKey = 0 }: {
  product: string; document: Document; reloadKey?: number;
}) {
  const { data, isPending, error } = useData<Row[]>('transcript',
    { product, path: document.stage_path, epoch: String(reloadKey) });
  if (isPending) return <div className="empty-state" role="status">文字起こしを取得中…</div>;
  if (error) return <div className="error" role="alert">{(error as Error).message}</div>;
  if (!data?.length) {
    return <div className="empty-state">
      PDF以外の原本は画面表示できません。「原本を追加して構造化」で文字起こしを実行すると、AIが読み取った内容をここで確認できます。
    </div>;
  }
  return <TranscriptView pages={data} cached />;
}
