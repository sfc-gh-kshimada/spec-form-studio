import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const operations = new AsyncLocalStorage<{ id: string }>();

export function tracePhase(phase: 'pool' | 'submit' | 'poll' | 'result' | 'execute' | 'request' | 'render', started: number, queryId?: string, rows?: number) {
  const operation = operations.getStore();
  if (operation) console.info('[SFS timing]', JSON.stringify({ operation_id: operation.id, phase, elapsed_ms: Date.now() - started, query_id: queryId, rows }));
}

export function timedRequest(action: () => Promise<Response>): Promise<Response> {
  const id = randomUUID();
  return operations.run({ id }, async () => {
    const started = Date.now();
    try {
      const response = await action();
      response.headers.set('X-SFS-Operation', id);
      response.headers.set('Server-Timing', `request;dur=${Date.now() - started}`);
      return response;
    } finally { tracePhase('request', started); }
  });
}