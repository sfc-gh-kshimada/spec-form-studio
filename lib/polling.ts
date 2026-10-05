export function pollingDelay(initial: number, maximum: number, attempt: number): number {
  if (!Number.isFinite(initial) || initial < 50 || !Number.isFinite(maximum) || maximum < initial) {
    throw new Error('Invalid polling interval');
  }
  return Math.min(maximum, initial * 2 ** Math.min(Math.max(0, attempt), 16));
}