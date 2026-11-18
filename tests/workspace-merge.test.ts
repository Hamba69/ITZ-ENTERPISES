import test from 'node:test';
import assert from 'node:assert/strict';
import { demoWorkspace, emptyWorkspace } from '../src/lib/business';
import { mergeWorkspaces } from '../src/lib/workspace-merge';

test('workspace merge keeps distinct records from both sources', () => {
  const current = demoWorkspace();
  const incoming = emptyWorkspace();
  incoming.clients.push({
    id: 'local-client',
    name: 'Local client',
    email: '',
    phone: '',
    address: '',
    tin: '',
  });

  const result = mergeWorkspaces(current, incoming);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.documents.length, current.documents.length);
    assert.equal(result.data.clients.length, current.clients.length + 1);
  }
});

test('workspace merge deduplicates identical records and rejects conflicting IDs or numbers', () => {
  const current = demoWorkspace();
  const identical = mergeWorkspaces(current, structuredClone(current));
  assert.equal(identical.ok, true);

  const conflicting = structuredClone(current);
  conflicting.documents[0].notes = 'edited on another device';
  const result = mergeWorkspaces(current, conflicting);
  assert.deepEqual(result, { ok: false, conflicts: ['documents'] });

  const duplicateNumber = structuredClone(current);
  duplicateNumber.documents[0].id = 'different-id';
  const duplicateResult = mergeWorkspaces(current, duplicateNumber);
  assert.equal(duplicateResult.ok, false);
  if (!duplicateResult.ok) assert.ok(duplicateResult.conflicts.includes('document numbers'));
});
