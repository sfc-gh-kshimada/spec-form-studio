"use client";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { referenceStaleTime } from './query-refresh';

export async function readData<T>(resource: string, parameters: Record<string, string> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/data?${new URLSearchParams({ resource, ...parameters })}`, { cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '読み込みに失敗しました。');
  return body as T;
}
export function useData<T>(resource: string, parameters: Record<string, string> = {}, enabled = true) {
  return useQuery({ queryKey: ['data', resource, parameters], queryFn: ({ signal }) => readData<T>(resource, parameters, signal), enabled, retry: false, staleTime: referenceStaleTime(resource) });
}
export type Submit = (operation: string, body: object) => Promise<unknown>;

export function useBoundState<T>(binding: string, initial: T): [T, (value: T) => void] {
  const [state, setState] = useState({ binding, value: initial });
  if (state.binding !== binding) setState({ binding, value: initial });
  return [state.binding === binding ? state.value : initial, value => setState({ binding, value })];
}

export function useConsent(binding: unknown): [boolean, (accepted: boolean) => void] {
  const current = JSON.stringify(binding);
  const [accepted, setAccepted] = useState<string | null>(null);
  if (accepted !== null && accepted !== current) setAccepted(null);
  return [accepted === current, value => setAccepted(value ? current : null)];
}