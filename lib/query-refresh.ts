import type { QueryKey } from '@tanstack/react-query';

export function affectedQuery(queryKey: QueryKey, operation: string, input: object): boolean {
  const target = input as { product?: string; form?: string; scope?: string };
  const [family, resource, parameters] = queryKey;
  const scope = parameters as { product?: string; form?: string } | undefined;
  if (family !== 'data' || scope?.product !== target.product || operation === 'export') return false;
  if (resource === 'history' || resource === 'batch' || resource === 'bulk_master') return true;
  // A bulk confirm changes exactly what a one-by-one master confirm changes, just
  // for many attributes, so it refreshes the same resources.
  const affectsMaster = operation === 'master' || operation === 'bulk_master'
    || (operation === 'batch' && ['master', 'all'].includes(target.scope ?? ''));
  if (affectsMaster) return ['master', 'fields', 'candidates'].includes(String(resource));
  // A bulk form confirm changes one form's fields, like a one-by-one form confirm.
  if (operation === 'bulk_form') return resource === 'fields' && scope?.form === target.form;
  return resource === 'fields' && scope?.form === (target.form ?? target.scope);
}

export function referenceStaleTime(resource: string): number {
  return ['products', 'forms', 'references', 'documents', 'issues'].includes(resource) ? 15_000 : 0;
}

export function blockingRefresh(queryKey: QueryKey, operation: string, input: object): boolean {
  if (!affectedQuery(queryKey, operation, input)) return false;
  const resource = queryKey[1];
  return resource !== 'history' && !(operation === 'master' && resource === 'candidates');
}