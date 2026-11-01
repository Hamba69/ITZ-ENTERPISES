import { formatDate, lineTotal, money, totals, type Invoice } from '@/lib/business';
import { Brand } from './ui';
export function DocumentView({ doc }: { doc: Invoice }) {
  const t = totals(doc);
  const measurements = (
    <div className="measurement-print">
      {doc.measurements.map((m) => (
        <section key={m.id}>
          <h3>{m.title}</h3>
          <table>
            <thead>
              <tr>
                {m.columns.map((c, i) => (
                  <th key={i}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v || '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
  return (
    <article className={`document template-${doc.template} font-${doc.font}`}>
      <div className="document-topline">
        <span>PRECISION IN EVERY DETAIL.</span>
        <span>
          {doc.currency} / {doc.kind === 'invoice' ? 'BILLING' : 'ESTIMATE'}
        </span>
      </div>
      <header className="document-header">
        <div>
          <Brand />
          <h2>{doc.company.name}</h2>
          <p className="preserve">{doc.company.address}</p>
          <p>
            {doc.company.email}
            <br />
            {doc.company.phone}
          </p>
          {doc.company.tin && <p>TIN: {doc.company.tin}</p>}
        </div>
        <div className="document-id">
          <h1>{doc.kind === 'invoice' ? 'Invoice' : 'Quotation'}</h1>
          <strong>{doc.number}</strong>
          {doc.status === 'draft' && <span className="draft-stamp">DRAFT</span>}
          {doc.status === 'void' && <span className="draft-stamp">VOID</span>}
        </div>
      </header>
      <div className="document-parties">
        <div>
          <span className="doc-label">{doc.kind === 'invoice' ? 'BILL TO' : 'PREPARED FOR'}</span>
          <h3>{doc.client.name || 'Client name'}</h3>
          <p className="preserve">{doc.client.address}</p>
          <p>
            {doc.client.email}
            <br />
            {doc.client.phone}
          </p>
          {doc.client.tin && <p>TIN: {doc.client.tin}</p>}
        </div>
        <dl>
          <div>
            <dt>Issue date</dt>
            <dd>{formatDate(doc.issueDate)}</dd>
          </div>
          <div>
            <dt>{doc.kind === 'invoice' ? 'Due date' : 'Valid until'}</dt>
            <dd>{formatDate(doc.dueDate)}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{doc.currency}</dd>
          </div>
        </dl>
      </div>
      {doc.project && (
        <div className="project-line">
          <span className="doc-label">PROJECT / REFERENCE</span>
          <strong>{doc.project}</strong>
        </div>
      )}
      {doc.measurementPosition === 'before' && measurements}
      <table className="document-items">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th className="number">Qty</th>
            <th>Unit</th>
            <th className="number">Unit price</th>
            <th className="number">Item total</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, i) => (
            <tr key={item.id}>
              <td className="row-index">{String(i + 1).padStart(2, '0')}</td>
              <td>
                <strong>{item.description || 'Item description'}</strong>
                {item.measurement && <small>{item.measurement}</small>}
              </td>
              <td className="number">{item.quantity}</td>
              <td>{item.unit}</td>
              <td className="number">{money(item.price, doc.currency)}</td>
              <td className="number">
                <strong>{money(lineTotal(item, doc.currency), doc.currency)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="document-bottom">
        <div className="payment-instructions">
          <span className="doc-label">PAYMENT DETAILS</span>
          <p className="preserve">
            {doc.company.paymentDetails || 'Please contact us for payment arrangements.'}
          </p>
        </div>
        <div className="document-totals">
          <div>
            <span>Subtotal</span>
            <span>{money(t.subtotal, doc.currency)}</span>
          </div>
          {doc.discount > 0 && (
            <div>
              <span>Discount ({doc.discount}%)</span>
              <span>−{money(t.discount, doc.currency)}</span>
            </div>
          )}
          <div>
            <span>Tax ({doc.tax}%)</span>
            <span>{money(t.tax, doc.currency)}</span>
          </div>
          <div className="total">
            <span>Total</span>
            <strong>{money(t.total, doc.currency)}</strong>
          </div>
          {t.paid > 0 && (
            <>
              <div>
                <span>Payments received</span>
                <span>{money(t.paid, doc.currency)}</span>
              </div>
              <div className="balance">
                <span>Balance due</span>
                <strong>{money(t.balance, doc.currency)}</strong>
              </div>
            </>
          )}
        </div>
      </div>
      {doc.measurementPosition === 'after' && measurements}
      {doc.payments.length > 0 && (
        <section className="document-payments">
          <h3>Payment record</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method / reference</th>
                <th className="number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>
                    {p.method}
                    {p.reference && ` · ${p.reference}`}
                  </td>
                  <td className="number">{money(p.amount, doc.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer className="document-footer">
        {doc.terms && (
          <div>
            <span className="doc-label">TERMS & CONDITIONS</span>
            <p className="preserve">{doc.terms}</p>
          </div>
        )}
        {doc.notes && <p className="preserve thanks">{doc.notes}</p>}
        <div className="footer-rule">
          <span>ITZ ENGINEERING</span>
          <span>{doc.number}</span>
        </div>
      </footer>
    </article>
  );
}
