'use client';
import { useState } from 'react';
import {
  clientSchema,
  companySchema,
  currencies,
  expenseSchema,
  productSchema,
  today,
  uid,
  type Client,
  type Company,
  type Expense,
  type Product,
  type Workspace,
} from '@/lib/business';
import { Field, Modal } from './ui';
export type RecordForm =
  | { kind: 'client'; record?: Client }
  | { kind: 'product'; record?: Product }
  | { kind: 'expense'; record?: Expense };
export function RecordModal({
  form,
  workspace,
  onSave,
  onClose,
}: {
  form: RecordForm;
  workspace: Workspace;
  onSave: (w: Workspace) => Promise<boolean>;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const record = form.record;
  return (
    <Modal
      title={`${record ? 'Edit' : 'Add'} ${form.kind === 'product' ? 'library item' : form.kind}`}
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const values = Object.fromEntries(f.entries());
          const base = { ...values, id: record?.id || uid() };
          const schema =
            form.kind === 'client'
              ? clientSchema
              : form.kind === 'product'
                ? productSchema
                : expenseSchema;
          const parsed = schema.safeParse(
            form.kind === 'client'
              ? base
              : {
                  ...base,
                  [form.kind === 'product' ? 'price' : 'amount']: Number(
                    values[form.kind === 'product' ? 'price' : 'amount'],
                  ),
                },
          );
          if (!parsed.success) {
            setError(parsed.error.issues[0].message);
            return;
          }
          const key =
            form.kind === 'client' ? 'clients' : form.kind === 'product' ? 'products' : 'expenses';
          const next = {
            ...workspace,
            [key]: record
              ? workspace[key].map((r) => (r.id === record.id ? parsed.data : r))
              : [...workspace[key], parsed.data],
          } as Workspace;
          setBusy(true);
          try {
            if (await onSave(next)) onClose();
            else
              setError(
                'Could not save. Check your connection or reload if records changed in another tab. Your entries are still here.',
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        {form.kind === 'client' && (
          <>
            <Field label="Client / business name">
              <input name="name" required defaultValue={form.record?.name} />
            </Field>
            <div className="form-grid">
              <Field label="Email">
                <input name="email" type="email" defaultValue={form.record?.email} />
              </Field>
              <Field label="Phone">
                <input name="phone" defaultValue={form.record?.phone} />
              </Field>
            </div>
            <Field label="Address">
              <textarea name="address" defaultValue={form.record?.address} />
            </Field>
            <Field label="Tax ID / TIN">
              <input name="tin" defaultValue={form.record?.tin} />
            </Field>
          </>
        )}
        {form.kind === 'product' && (
          <>
            <Field label="Item / service name">
              <input name="name" required defaultValue={form.record?.name} />
            </Field>
            <Field label="Description / specification">
              <textarea name="description" defaultValue={form.record?.description} />
            </Field>
            <div className="form-grid">
              <Field label="Unit">
                <input name="unit" required defaultValue={form.record?.unit || 'pcs'} />
              </Field>
              <Field label="Unit price">
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  defaultValue={form.record?.price ?? 0}
                />
              </Field>
            </div>
            <Field label="Currency">
              <select
                name="currency"
                defaultValue={form.record?.currency || workspace.company.currency}
              >
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        {form.kind === 'expense' && (
          <>
            <Field label="Description">
              <input name="description" required defaultValue={form.record?.description} />
            </Field>
            <Field label="Supplier / vendor">
              <input name="vendor" defaultValue={form.record?.vendor} />
            </Field>
            <div className="form-grid">
              <Field label="Category">
                <select name="category" defaultValue={form.record?.category || 'Materials'}>
                  {['Materials', 'Labour', 'Transport', 'Equipment', 'Utilities', 'Other'].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Date paid">
                <input
                  type="date"
                  name="date"
                  max={today()}
                  required
                  defaultValue={form.record?.date || today()}
                />
              </Field>
              <Field label="Amount paid">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={form.record?.amount}
                />
              </Field>
              <Field label="Currency">
                <select
                  name="currency"
                  defaultValue={form.record?.currency || workspace.company.currency}
                >
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Receipt / reference">
              <input name="reference" defaultValue={form.record?.reference} />
            </Field>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save ' + (form.kind === 'product' ? 'item' : form.kind)}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function CompanyForm({
  company,
  onSave,
}: {
  company: Company;
  onSave: (c: Company) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="panel settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = companySchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
        if (!p.success) {
          setError(p.error.issues[0].message);
          return;
        }
        setBusy(true);
        await onSave(p.data);
        setBusy(false);
      }}
    >
      <h2>Business identity</h2>
      <p className="muted">
        Used on new documents. Existing documents keep their original details.
      </p>
      <Field label="Registered business name">
        <input name="name" required defaultValue={company.name} />
      </Field>
      <Field label="Business address">
        <textarea name="address" defaultValue={company.address} />
      </Field>
      <div className="form-grid">
        <Field label="Business email">
          <input name="email" type="email" defaultValue={company.email} />
        </Field>
        <Field label="Business phone">
          <input name="phone" defaultValue={company.phone} />
        </Field>
        <Field label="Tax ID / TIN">
          <input name="tin" defaultValue={company.tin} />
        </Field>
        <Field label="Default currency">
          <select name="currency" defaultValue={company.currency}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Payment details">
        <textarea
          name="paymentDetails"
          rows={3}
          placeholder="Bank name, account name and number, or mobile money instructions"
          defaultValue={company.paymentDetails}
        />
      </Field>
      <Field label="Default payment terms">
        <textarea name="terms" defaultValue={company.terms} />
      </Field>
      <Field label="Default closing note">
        <textarea name="notes" defaultValue={company.notes} />
      </Field>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save business details'}
      </button>
    </form>
  );
}
