import test from 'node:test';
import assert from 'node:assert/strict';
import {
  csv,
  demoWorkspace,
  documentSchema,
  emptyWorkspace,
  lineTotal,
  newDocument,
  nextNumber,
  statusOf,
  totals,
  workspaceSchema,
  today,
  addDays,
} from '../src/lib/business';

test('decimal-safe currency arithmetic, discount before tax and payments', () => {
  const d = newDocument(emptyWorkspace());
  d.currency = 'USD';
  d.items = [
    { id: 'a', description: 'Service', measurement: '', quantity: 3, unit: 'hour', price: 0.1 },
  ];
  d.discount = 10;
  d.tax = 20;
  d.payments = [{ id: 'p', date: today(), amount: 0.1, method: 'Cash', reference: '' }];
  assert.deepEqual(totals(d), {
    subtotal: 0.3,
    discount: 0.03,
    tax: 0.05,
    total: 0.32,
    paid: 0.1,
    balance: 0.22,
  });
});
test('whole-shilling currencies round each line and tax half up', () => {
  assert.equal(lineTotal({ quantity: 1.5, price: 101 }, 'UGX'), 152);
  const d = newDocument(emptyWorkspace());
  d.items[0].price = 101;
  d.tax = 18;
  assert.equal(totals(d).tax, 18);
});
test('status respects draft, issued, overdue, partial, paid and void', () => {
  const d = demoWorkspace().documents[0];
  assert.equal(statusOf(d), 'overdue');
  d.dueDate = addDays(today(), 2);
  assert.equal(statusOf(d), 'partial');
  d.payments = [];
  assert.equal(statusOf(d), 'unpaid');
  d.payments = [{ id: 'p', date: today(), amount: totals(d).total, method: 'Cash', reference: '' }];
  assert.equal(statusOf(d), 'paid');
  d.status = 'void';
  assert.equal(statusOf(d), 'void');
  d.status = 'draft';
  assert.equal(statusOf(d), 'draft');
});
test('rejects overpayments, invalid dates, negative prices and quote payments', () => {
  const d = demoWorkspace().documents[0];
  assert.equal(documentSchema.safeParse(d).success, true);
  assert.equal(documentSchema.safeParse({ ...d, kind: 'quotation' }).success, false);
  assert.equal(documentSchema.safeParse({ ...d, status: 'void' }).success, false);
  assert.equal(documentSchema.safeParse({ ...d, issueDate: '2026-02-30' }).success, false);
  assert.equal(
    documentSchema.safeParse({ ...d, payments: [{ ...d.payments[0], amount: 1e12 }] }).success,
    false,
  );
  assert.equal(
    documentSchema.safeParse({ ...d, items: [{ ...d.items[0], price: -1 }] }).success,
    false,
  );
});
test('sample workspace validates and duplicate numbers or IDs are rejected', () => {
  const w = demoWorkspace();
  assert.equal(workspaceSchema.safeParse(w).success, true);
  assert.equal(
    workspaceSchema.safeParse({ ...w, documents: [...w.documents, w.documents[0]] }).success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({
      ...w,
      documents: [...w.documents, { ...w.documents[0], id: 'new-id' }],
    }).success,
    false,
  );
  assert.notEqual(nextNumber(w, 'invoice'), w.documents[0].number);
});
test('measurement schedules are rectangular and bounded', () => {
  const d = demoWorkspace().documents[0];
  assert.equal(
    documentSchema.safeParse({
      ...d,
      measurements: [{ id: 'm', title: 'Windows', columns: ['A', 'B'], rows: [['only one']] }],
    }).success,
    false,
  );
});
test('CSV escapes quoting, newlines and spreadsheet formula injection', () => {
  assert.equal(
    csv([['=HYPERLINK("evil")', 'a,b', 'a\nb']]),
    '"\'=HYPERLINK(""evil"")","a,b","a\nb"',
  );
});
