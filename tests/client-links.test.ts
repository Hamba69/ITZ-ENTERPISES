import test from 'node:test';
import assert from 'node:assert/strict';
import { demoWorkspace } from '../src/lib/business';
import { receiptChanges, commentInput, type Receipt } from '../src/lib/client-links';
import { validateGallery, validateUpload } from '../src/lib/project-media';
test('receipts freeze snapshots, retain corrected/removed payments, never reuse numbers', () => {
  const doc = demoWorkspace().documents[0];
  const first = receiptChanges(doc, []).additions[0];
  assert.equal(first.snapshot.number, `R-${doc.number}-01`);
  assert.equal(first.snapshot.balance, 900000);
  const existing: Receipt[] = [{ ...first, id: 'r1', superseded: false }];
  assert.deepEqual(
    receiptChanges({ ...doc, company: { ...doc.company, name: 'Changed company' } }, existing),
    { supersede: [], additions: [] },
  );
  const corrected = { ...doc, payments: [{ ...doc.payments[0], amount: 400000 }] };
  const change = receiptChanges(corrected, existing);
  assert.deepEqual(change.supersede, ['r1']);
  assert.equal(change.additions[0].sequence, 2);
  assert.equal(existing[0].snapshot.payment.amount, 500000);
  assert.deepEqual(receiptChanges({ ...doc, payments: [] }, existing).supersede, ['r1']);
  assert.equal(
    receiptChanges(doc, [{ ...existing[0], superseded: true }]).additions[0].sequence,
    2,
  );
});
test('comments and media reject bad inputs and capacity overruns', () => {
  assert.equal(commentInput.safeParse({ name: ' ', message: 'hi' }).success, false);
  assert.equal(
    commentInput.safeParse({ name: 'A', message: 'hi', website: 'spam' }).success,
    false,
  );
  assert.equal(
    commentInput.safeParse({ name: 'A', message: '<script>plain text</script>' }).success,
    true,
  );
  assert.throws(() => validateUpload({ type: 'image/jpeg', size: 15000001 }));
  assert.throws(() => validateUpload({ type: 'video/mp4', size: 30000001 }));
  assert.throws(() => validateUpload({ type: 'video/mp4', size: 1 }, 91));
  assert.throws(() => validateUpload({ type: 'application/pdf', size: 1 }));
  assert.equal(validateUpload({ type: 'video/quicktime', size: 30000000 }, 90), 'video');
  assert.throws(() =>
    validateGallery(
      Array.from({ length: 40 }, () => ({ kind: 'image', bytes: 1 })),
      { kind: 'image', bytes: 1 },
    ),
  );
  assert.throws(() =>
    validateGallery([{ kind: 'video', bytes: 149000000 }], { kind: 'image', bytes: 1000001 }),
  );
});
