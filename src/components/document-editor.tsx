'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  Save,
  Check,
  Ruler,
  Palette,
  List,
  LayoutGrid,
  Table2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  currencies,
  documentSchema,
  lineTotal,
  money,
  templates,
  totals,
  uid,
  type Invoice,
  type Workspace,
} from '@/lib/business';
import { DocumentView } from './document-view';
import { Field, Modal } from './ui';
export function DocumentEditor({
  initial,
  workspace,
  onSave,
  onClose,
}: {
  initial: Invoice;
  workspace: Workspace;
  onSave: (d: Invoice) => Promise<boolean>;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<Invoice>(structuredClone(initial));
  const [tab, setTab] = useState('details');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [itemEntryMode, setItemEntryMode] = useState<'cards' | 'table'>('cards');
  const patch = (v: Partial<Invoice>) => {
    setDoc((d) => ({ ...d, ...v }));
    setDirty(true);
  };
  const close = () => {
    if (!dirty || window.confirm('Discard unsaved document changes?')) onClose();
  };
  const save = async (issue: boolean) => {
    const next = {
      ...doc,
      status: issue ? ('issued' as const) : ('draft' as const),
      updatedAt: new Date().toISOString(),
    };
    const result = documentSchema.safeParse(next);
    if (!result.success) {
      setError(
        result.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .slice(0, 3)
          .join(' · '),
      );
      return;
    }
    setBusy(true);
    try {
      if (await onSave(result.data)) {
        setDirty(false);
        onClose();
      } else {
        setError(
          'Could not save. Check the workspace message. Your changes are still in this editor.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const t = totals(doc);
  return (
    <div className="editor-page">
      <div className="editor-toolbar">
        <button className="button ghost" onClick={close}>
          <ArrowLeft size={17} />
          Back
        </button>
        <div className="editor-title">
          <strong>{initial.number}</strong>
          <span className="badge draft">Draft</span>
          <small>{dirty ? 'Unsaved changes' : 'New document'}</small>
        </div>
        <div className="actions">
          <button className="button" onClick={() => setPreview(true)}>
            <Eye size={16} />
            Preview
          </button>
          <button className="button" disabled={busy} onClick={() => save(false)}>
            <Save size={16} />
            Save draft
          </button>
          <button className="button primary" disabled={busy} onClick={() => save(true)}>
            <Check size={16} />
            {busy ? 'Saving…' : 'Issue ' + doc.kind}
          </button>
        </div>
      </div>
      <div className="editor-layout">
        <div className="editor-form">
          <div className="editor-intro">
            <span className="eyebrow">MAKE IT OFFICIAL</span>
            <h1>
              {workspace.documents.some((d) => d.id === doc.id) ? 'Edit' : 'New'} {doc.kind}
            </h1>
            <p>Good work deserves a great invoice.</p>
          </div>
          <div className="tabs">
            {[
              ['details', 'Details', List],
              ['measurements', 'Measurements', Ruler],
              ['design', 'Design', Palette],
            ].map(([id, label, Icon]) => (
              <button
                key={id as string}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id as string)}
              >
                {typeof Icon !== 'string' && <Icon size={16} />}
                <span>{label as string}</span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {tab === 'details' && (
            <>
              <section className="form-section">
                <div className="section-number">
                  01 <h3>Document details</h3>
                </div>
                <div className="form-grid">
                  <Field
                    label="Document number"
                    hint="System-assigned and locked to preserve numbering history."
                  >
                    <input value={doc.number} readOnly />
                  </Field>
                  <Field label="Currency">
                    <select
                      value={doc.currency}
                      disabled={doc.payments.length > 0}
                      onChange={(e) => patch({ currency: e.target.value as Invoice['currency'] })}
                    >
                      {currencies.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Issue date">
                    <input
                      type="date"
                      value={doc.issueDate}
                      onChange={(e) => patch({ issueDate: e.target.value })}
                    />
                  </Field>
                  <Field label={doc.kind === 'invoice' ? 'Due date' : 'Valid until'}>
                    <input
                      type="date"
                      value={doc.dueDate}
                      min={doc.issueDate}
                      onChange={(e) => patch({ dueDate: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Project / reference">
                  <input
                    placeholder="e.g. Window fabrication · Plot 24"
                    value={doc.project}
                    onChange={(e) => patch({ project: e.target.value })}
                  />
                </Field>
              </section>
              <section className="form-section">
                <div className="section-number">
                  02 <h3>Who is it for?</h3>
                </div>
                <Field label="Saved client">
                  <select
                    value={
                      workspace.clients.some((c) => c.id === doc.client.id) ? doc.client.id : ''
                    }
                    onChange={(e) => {
                      const c = workspace.clients.find((c) => c.id === e.target.value);
                      if (c) patch({ client: { ...c } });
                      else
                        patch({
                          client: {
                            id: uid(),
                            name: '',
                            email: '',
                            phone: '',
                            address: '',
                            tin: '',
                          },
                        });
                    }}
                  >
                    <option value="">Enter a client manually</option>
                    {workspace.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Client name">
                    <input
                      value={doc.client.name}
                      onChange={(e) => patch({ client: { ...doc.client, name: e.target.value } })}
                    />
                  </Field>
                  <Field label="Client email">
                    <input
                      type="email"
                      value={doc.client.email}
                      onChange={(e) => patch({ client: { ...doc.client, email: e.target.value } })}
                    />
                  </Field>
                  <Field label="Client phone">
                    <input
                      value={doc.client.phone}
                      onChange={(e) => patch({ client: { ...doc.client, phone: e.target.value } })}
                    />
                  </Field>
                  <Field label="Client tax ID / TIN">
                    <input
                      value={doc.client.tin}
                      onChange={(e) => patch({ client: { ...doc.client, tin: e.target.value } })}
                    />
                  </Field>
                </div>
                <Field label="Billing address">
                  <textarea
                    rows={2}
                    value={doc.client.address}
                    onChange={(e) => patch({ client: { ...doc.client, address: e.target.value } })}
                  />
                </Field>
              </section>
              <section className="form-section line-section">
                <div className="line-section-heading">
                  <div className="section-number">
                    03 <h3>The work, item by item</h3>
                  </div>
                  <div className="entry-mode" role="group" aria-label="Item entry format">
                    <button
                      type="button"
                      className={itemEntryMode === 'cards' ? 'active' : ''}
                      aria-pressed={itemEntryMode === 'cards'}
                      onClick={() => setItemEntryMode('cards')}
                    >
                      <LayoutGrid size={15} />
                      Cards
                    </button>
                    <button
                      type="button"
                      className={itemEntryMode === 'table' ? 'active' : ''}
                      aria-pressed={itemEntryMode === 'table'}
                      onClick={() => setItemEntryMode('table')}
                    >
                      <Table2 size={15} />
                      Table
                    </button>
                  </div>
                </div>
                <Field label="Add from item library">
                  <select
                    value=""
                    onChange={(e) => {
                      const p = workspace.products.find((p) => p.id === e.target.value);
                      if (p)
                        patch({
                          items: [
                            ...doc.items.filter((i) => i.description || i.price),
                            {
                              id: uid(),
                              description: p.name,
                              measurement: p.description,
                              quantity: 1,
                              unit: p.unit,
                              price: p.price,
                            },
                          ],
                        });
                    }}
                  >
                    <option value="">Choose an item in {doc.currency}…</option>
                    {workspace.products
                      .filter((p) => p.currency === doc.currency)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {money(p.price, p.currency)}
                        </option>
                      ))}
                  </select>
                </Field>
                {itemEntryMode === 'cards' ? (
                  <div className="line-items-editor">
                    {doc.items.map((item, index) => (
                      <div className="line-card" key={item.id}>
                        <div className="line-card-head">
                          <span>ITEM {String(index + 1).padStart(2, '0')}</span>
                          <div className="actions">
                            <button
                              className="icon-button"
                              aria-label={`Move item ${index + 1} up`}
                              disabled={index === 0}
                              onClick={() => {
                                const items = [...doc.items];
                                [items[index - 1], items[index]] = [items[index], items[index - 1]];
                                patch({ items });
                              }}
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Move item ${index + 1} down`}
                              disabled={index === doc.items.length - 1}
                              onClick={() => {
                                const items = [...doc.items];
                                [items[index + 1], items[index]] = [items[index], items[index + 1]];
                                patch({ items });
                              }}
                            >
                              <ChevronDown size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={`Remove item ${index + 1}`}
                              disabled={doc.items.length === 1}
                              onClick={() =>
                                patch({ items: doc.items.filter((i) => i.id !== item.id) })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <Field label="Description">
                          <input
                            placeholder="e.g. Steel window frame"
                            value={item.description}
                            onChange={(e) =>
                              patch({
                                items: doc.items.map((i) =>
                                  i.id === item.id ? { ...i, description: e.target.value } : i,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Dimensions / specification">
                          <input
                            placeholder="e.g. 1200 × 1500 mm · powder coated"
                            value={item.measurement}
                            onChange={(e) =>
                              patch({
                                items: doc.items.map((i) =>
                                  i.id === item.id ? { ...i, measurement: e.target.value } : i,
                                ),
                              })
                            }
                          />
                        </Field>
                        <div className="quantity-grid">
                          <Field label="Qty">
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={item.quantity}
                              onChange={(e) =>
                                patch({
                                  items: doc.items.map((i) =>
                                    i.id === item.id
                                      ? { ...i, quantity: Number(e.target.value) }
                                      : i,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="Unit">
                            <input
                              value={item.unit}
                              onChange={(e) =>
                                patch({
                                  items: doc.items.map((i) =>
                                    i.id === item.id ? { ...i, unit: e.target.value } : i,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="Unit price">
                            <input
                              type="number"
                              min="0"
                              step={['UGX', 'JPY'].includes(doc.currency) ? '1' : '0.01'}
                              value={item.price}
                              onChange={(e) =>
                                patch({
                                  items: doc.items.map((i) =>
                                    i.id === item.id ? { ...i, price: Number(e.target.value) } : i,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <div className="line-amount">
                            <span>Item total</span>
                            <strong>{money(lineTotal(item, doc.currency), doc.currency)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="table-scroll line-items-table-wrap">
                    <table className="line-items-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Description</th>
                          <th>Dimensions / specification</th>
                          <th className="number">Qty</th>
                          <th>Unit</th>
                          <th className="number">Unit price</th>
                          <th className="number">Item total</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.items.map((item, index) => (
                          <tr key={item.id}>
                            <td>{String(index + 1).padStart(2, '0')}</td>
                            <td>
                              <input
                                aria-label={`Description for item ${index + 1}`}
                                placeholder="Item or service"
                                value={item.description}
                                onChange={(e) =>
                                  patch({
                                    items: doc.items.map((i) =>
                                      i.id === item.id ? { ...i, description: e.target.value } : i,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Dimensions / specification for item ${index + 1}`}
                                placeholder="Optional"
                                value={item.measurement}
                                onChange={(e) =>
                                  patch({
                                    items: doc.items.map((i) =>
                                      i.id === item.id ? { ...i, measurement: e.target.value } : i,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Quantity for item ${index + 1}`}
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={item.quantity}
                                onChange={(e) =>
                                  patch({
                                    items: doc.items.map((i) =>
                                      i.id === item.id
                                        ? { ...i, quantity: Number(e.target.value) }
                                        : i,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Unit for item ${index + 1}`}
                                value={item.unit}
                                onChange={(e) =>
                                  patch({
                                    items: doc.items.map((i) =>
                                      i.id === item.id ? { ...i, unit: e.target.value } : i,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Unit price for item ${index + 1}`}
                                type="number"
                                min="0"
                                step={['UGX', 'JPY'].includes(doc.currency) ? '1' : '0.01'}
                                value={item.price}
                                onChange={(e) =>
                                  patch({
                                    items: doc.items.map((i) =>
                                      i.id === item.id
                                        ? { ...i, price: Number(e.target.value) }
                                        : i,
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className="number item-total">
                              {money(lineTotal(item, doc.currency), doc.currency)}
                            </td>
                            <td>
                              <button
                                className="icon-button danger"
                                aria-label={`Remove item ${index + 1}`}
                                disabled={doc.items.length === 1}
                                onClick={() =>
                                  patch({ items: doc.items.filter((i) => i.id !== item.id) })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  className="button add-line"
                  onClick={() =>
                    patch({
                      items: [
                        ...doc.items,
                        {
                          id: uid(),
                          description: '',
                          measurement: '',
                          quantity: 1,
                          unit: 'pcs',
                          price: 0,
                        },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Add line item
                </button>
                <div className="form-grid">
                  <Field label="Discount (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={doc.discount}
                      onChange={(e) => patch({ discount: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Tax (%)" hint="Set the applicable rate for this document.">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={doc.tax}
                      onChange={(e) => patch({ tax: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <div className="editor-total">
                  <span>Document total</span>
                  <strong>{money(t.total, doc.currency)}</strong>
                </div>
              </section>
              <section className="form-section">
                <div className="section-number">
                  04 <h3>The finishing details</h3>
                </div>
                <Field label="Payment details">
                  <textarea
                    rows={3}
                    value={doc.company.paymentDetails}
                    placeholder="Bank or mobile money details, account name and reference"
                    onChange={(e) =>
                      patch({ company: { ...doc.company, paymentDetails: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Terms & conditions">
                  <textarea value={doc.terms} onChange={(e) => patch({ terms: e.target.value })} />
                </Field>
                <Field label="Notes / thank-you message">
                  <textarea value={doc.notes} onChange={(e) => patch({ notes: e.target.value })} />
                </Field>
              </section>
            </>
          )}
          {tab === 'design' && (
            <section className="form-section">
              <h3>A document that feels like you.</h3>
              <p className="muted">Four considered layouts, one unmistakable identity.</p>
              <div className="template-picker">
                {templates.map((temp) => (
                  <button
                    key={temp.id}
                    className={'template-choice ' + (doc.template === temp.id ? 'selected' : '')}
                    onClick={() => patch({ template: temp.id })}
                  >
                    <div
                      className={'mini-page mini-' + temp.id}
                      style={{ '--template-color': temp.color } as React.CSSProperties}
                    >
                      <div>
                        <b>ITZ</b>
                        <span>INVOICE</span>
                      </div>
                      <i />
                      <i />
                      <div className="mini-table" />
                      <i />
                      <i />
                    </div>
                    <strong>
                      {temp.name}
                      {doc.template === temp.id && <Check size={14} />}
                    </strong>
                    <small>{temp.description}</small>
                  </button>
                ))}
              </div>
              <Field label="Document typography">
                <select
                  value={doc.font}
                  onChange={(e) => patch({ font: e.target.value as Invoice['font'] })}
                >
                  <option value="sans">Modern sans · clean & versatile</option>
                  <option value="serif">Classic serif · refined & traditional</option>
                  <option value="mono">Technical mono · precise & structured</option>
                </select>
              </Field>
            </section>
          )}
          {tab === 'measurements' && (
            <section className="form-section">
              <h3>Measure twice. Document once.</h3>
              <p className="muted">
                Custom schedules for windows, doors, rails and site measurements. These tables are
                descriptive and do not change the invoice total.
              </p>
              <Field label="Position on document">
                <select
                  value={doc.measurementPosition}
                  onChange={(e) =>
                    patch({ measurementPosition: e.target.value as Invoice['measurementPosition'] })
                  }
                >
                  <option value="after">After line items</option>
                  <option value="before">Before line items</option>
                  <option value="hidden">Hide from document</option>
                </select>
              </Field>
              {doc.measurements.map((m, mi) => {
                const update = (v: Partial<typeof m>) =>
                  patch({
                    measurements: doc.measurements.map((x) => (x.id === m.id ? { ...x, ...v } : x)),
                  });
                return (
                  <div className="measurement-editor" key={m.id}>
                    <div className="actions">
                      <Field label={`Schedule ${mi + 1} title`}>
                        <input
                          value={m.title}
                          onChange={(e) => update({ title: e.target.value })}
                        />
                      </Field>
                      <button
                        className="icon-button danger"
                        aria-label={`Delete schedule ${mi + 1}`}
                        onClick={() =>
                          patch({ measurements: doc.measurements.filter((x) => x.id !== m.id) })
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {m.columns.map((c, ci) => (
                              <th key={ci}>
                                <input
                                  aria-label={`Column ${ci + 1} title`}
                                  value={c}
                                  onChange={(e) =>
                                    update({
                                      columns: m.columns.map((x, i) =>
                                        i === ci ? e.target.value : x,
                                      ),
                                    })
                                  }
                                />
                                <button
                                  className="text-button danger"
                                  disabled={m.columns.length === 1}
                                  onClick={() =>
                                    update({
                                      columns: m.columns.filter((_, i) => i !== ci),
                                      rows: m.rows.map((r) => r.filter((_, i) => i !== ci)),
                                    })
                                  }
                                >
                                  Remove
                                </button>
                              </th>
                            ))}
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {m.rows.map((r, ri) => (
                            <tr key={ri}>
                              {r.map((v, ci) => (
                                <td key={ci}>
                                  <input
                                    aria-label={`${m.columns[ci]} row ${ri + 1}`}
                                    value={v}
                                    onChange={(e) =>
                                      update({
                                        rows: m.rows.map((row, i) =>
                                          i === ri
                                            ? row.map((cell, j) =>
                                                j === ci ? e.target.value : cell,
                                              )
                                            : row,
                                        ),
                                      })
                                    }
                                  />
                                </td>
                              ))}
                              <td>
                                <button
                                  className="icon-button danger"
                                  aria-label={`Remove row ${ri + 1}`}
                                  onClick={() =>
                                    update({ rows: m.rows.filter((_, i) => i !== ri) })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <button
                        className="button"
                        onClick={() => update({ rows: [...m.rows, m.columns.map(() => '')] })}
                      >
                        <Plus size={14} />
                        Row
                      </button>
                      <button
                        className="button"
                        disabled={m.columns.length >= 8}
                        onClick={() =>
                          update({
                            columns: [...m.columns, 'Column'],
                            rows: m.rows.map((r) => [...r, '']),
                          })
                        }
                      >
                        <Plus size={14} />
                        Column
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                className="button add-line"
                onClick={() =>
                  patch({
                    measurements: [
                      ...doc.measurements,
                      {
                        id: uid(),
                        title: 'Window schedule',
                        columns: ['Reference', 'Width (mm)', 'Height (mm)', 'Qty'],
                        rows: [['', '', '', '']],
                      },
                    ],
                  })
                }
              >
                <Plus size={16} />
                Add measurement schedule
              </button>
            </section>
          )}
        </div>
        <aside className="live-preview">
          <div className="preview-label">
            <span>
              <span className="live-dot" /> LIVE PREVIEW
            </span>
            <button className="text-button" onClick={() => setPreview(true)}>
              Expand <Eye size={14} />
            </button>
          </div>
          <div className="preview-scale">
            <DocumentView doc={doc} />
          </div>
          <p className="preview-note">A4 document · Your preview updates as you work</p>
        </aside>
      </div>
      {preview && (
        <Modal title="Document preview" onClose={() => setPreview(false)} wide>
          <div className="full-preview">
            <DocumentView doc={doc} />
          </div>
        </Modal>
      )}
    </div>
  );
}
