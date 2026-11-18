import { emptyWorkspace, workspaceSchema, type Workspace } from './business';

export type WorkspaceMergeResult =
  | { ok: true; data: Workspace }
  | { ok: false; conflicts: string[] };

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeRecords<T extends { id: string }>(
  current: T[],
  incoming: T[],
  collection: string,
  conflicts: Set<string>,
) {
  const merged = [...current];
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const record of incoming) {
    const existing = byId.get(record.id);
    if (!existing) {
      merged.push(record);
      byId.set(record.id, record);
    } else if (!equal(existing, record)) {
      conflicts.add(collection);
    }
  }
  return merged;
}

export function mergeWorkspaces(current: Workspace, incoming: Workspace): WorkspaceMergeResult {
  const conflicts = new Set<string>();
  const defaultCompany = emptyWorkspace().company;
  let company = current.company;
  if (!equal(current.company, incoming.company)) {
    if (equal(current.company, defaultCompany)) company = incoming.company;
    else if (!equal(incoming.company, defaultCompany)) conflicts.add('company settings');
  }

  const documents = mergeRecords(current.documents, incoming.documents, 'documents', conflicts);
  const documentNumbers = new Map<string, string>();
  for (const document of documents) {
    const number = document.number.toLowerCase();
    const existingId = documentNumbers.get(number);
    if (existingId && existingId !== document.id) conflicts.add('document numbers');
    else documentNumbers.set(number, document.id);
  }

  const data = workspaceSchema.safeParse({
    schemaVersion: 1,
    company,
    clients: mergeRecords(current.clients, incoming.clients, 'clients', conflicts),
    products: mergeRecords(current.products, incoming.products, 'products', conflicts),
    documents,
    expenses: mergeRecords(current.expenses, incoming.expenses, 'expenses', conflicts),
  });
  if (!data.success) conflicts.add('workspace validation');

  if (!data.success) return { ok: false, conflicts: [...conflicts] };
  if (conflicts.size) return { ok: false, conflicts: [...conflicts] };
  return { ok: true, data: data.data };
}
