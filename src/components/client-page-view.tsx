'use client';
import { useEffect, useRef, useState } from 'react';
import { DocumentView } from './document-view';
import { formatDate, money, statusOf, totals } from '@/lib/business';
import { commentInput, type ClientPageData, type GalleryMedia } from '@/lib/client-links';
import './client-page.css';

function Gallery({ title, media }: { title: string; media: GalleryMedia[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement | null>(null),
    touch = useRef(0);
  useEffect(() => {
    if (index !== null) dialog.current?.showModal();
    else {
      dialog.current?.close();
      trigger.current?.focus();
    }
  }, [index]);
  const move = (n: number) =>
    setIndex((i) => (i === null ? null : (i + n + media.length) % media.length));
  const selected = index === null ? null : media[index];
  if (!media.length) return null;
  return (
    <section className="cp-section">
      <p className="cp-kicker">PROJECT RECORD / GALLERY</p>
      <h2>{title}</h2>
      <p>
        {media.filter((m) => m.kind === 'image').length} photos ·{' '}
        {media.filter((m) => m.kind === 'video').length} videos
      </p>
      <div className="cp-gallery">
        {media.map((m, i) => (
          <button
            className={i === 0 ? 'cp-hero' : ''}
            key={m.id}
            onClick={(e) => {
              trigger.current = e.currentTarget;
              setIndex(i);
            }}
            aria-label={`Open ${m.kind} ${i + 1}: ${m.caption}`}
          >
            {/* Native images deliberately retain intrinsic dimensions and use same-origin delivery. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.kind === 'video' ? m.poster : m.url}
              width={m.width}
              height={m.height}
              loading="lazy"
              alt={m.caption || `Project ${m.kind} ${i + 1}`}
            />
            {m.kind === 'video' && <span className="cp-play">▶ Play video</span>}
            <span>{m.caption}</span>
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="cp-lightbox"
        aria-label="Project gallery"
        onCancel={(e) => {
          e.preventDefault();
          setIndex(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            move(1);
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            move(-1);
          }
          if (e.key === 'Tab') {
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                'button,video[controls],[tabindex="0"]',
              ),
            );
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        onTouchStart={(e) => {
          touch.current = e.changedTouches[0].clientX;
        }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(delta) > 50) move(delta < 0 ? 1 : -1);
        }}
      >
        <button onClick={() => setIndex(null)}>Close gallery</button>
        {selected && (
          <>
            {selected.kind === 'video' ? (
              <video
                key={selected.id}
                src={selected.url}
                poster={selected.poster}
                preload="none"
                playsInline
                controls
              />
            ) : (
              <img
                src={selected.url}
                width={selected.width}
                height={selected.height}
                alt={selected.caption}
              />
            )}
            <p>{selected.caption}</p>
            <p aria-live="polite">
              {index! + 1} / {media.length}
            </p>
          </>
        )}
        <div className="cp-actions">
          <button onClick={() => move(-1)}>Previous image</button>
          <button onClick={() => move(1)}>Next image</button>
        </div>
      </dialog>
    </section>
  );
}
export function ClientPageView({ data, token }: { data: ClientPageData; token: string }) {
  const doc = data.document,
    total = totals(doc).total,
    voided = doc.status === 'void';
  const [count, setCount] = useState(total),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      setCount(total * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [total]);
  async function download(receipt?: ClientPageData['receipts'][number]) {
    try {
      const pdf = await import('@/lib/pdf');
      if (receipt) pdf.exportReceiptPdf(receipt.snapshot, receipt.superseded);
      else pdf.exportPdf({ ...doc, auditTrail: [] });
    } catch {
      setError('Download failed. Please try again.');
    }
  }
  return (
    <main className="client-page">
      <div className="cp-shell">
        <header className="cp-header">
          <span className="cp-wordmark">
            ITZ<span> ENGINEERING</span>
          </span>
          <span>PRIVATE CLIENT COPY</span>
        </header>
        <div className="cp-titleblock">
          <div>
            <small>DOCUMENT</small>
            <strong>{doc.number}</strong>
          </div>
          <div>
            <small>REVISION</small>
            <strong>
              {data.revisedAt ? `Revised ${formatDate(data.revisedAt.slice(0, 10))}` : 'As issued'}
            </strong>
          </div>
          <div>
            <small>ISSUE DATE</small>
            <strong>{formatDate(doc.issueDate)}</strong>
          </div>
          <div>
            <small>ISSUED BY</small>
            <strong>{doc.company.name}</strong>
          </div>
          <div>
            <small>PROJECT</small>
            <strong>{doc.project || 'Engineering works'}</strong>
          </div>
        </div>
        <section className="cp-summary">
          <div>
            <p className="cp-kicker">PRECISION IN EVERY DETAIL</p>
            <h1>{doc.kind === 'invoice' ? 'Your invoice.' : 'Your quotation.'}</h1>
            <span className="cp-stamp">
              {voided ? 'VOID — This document is no longer valid' : statusOf(doc)}
            </span>
          </div>
          <div>
            <small>DOCUMENT TOTAL</small>
            <p className="cp-total" aria-label={money(total, doc.currency)}>
              {money(count, doc.currency)}
            </p>
          </div>
        </section>
        {!voided && (
          <div className="cp-actions">
            <button className="cp-primary" onClick={() => download()}>
              Download PDF
            </button>
            <button onClick={() => window.print()}>Print</button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <section className="cp-sheet" aria-label="Document sheet">
          <DocumentView doc={doc} />
        </section>
        {doc.kind === 'invoice' && data.receipts.length > 0 && (
          <section className="cp-section">
            <p className="cp-kicker">PAYMENT RECORD</p>
            <h2>Payment receipts</h2>
            <div className="cp-receipts">
              {data.receipts.map((r) => (
                <article key={r.id} className="cp-receipt">
                  <h3>{r.snapshot.number}</h3>
                  <p>
                    {formatDate(r.snapshot.payment.date)} · {r.snapshot.payment.method}
                  </p>
                  <p>
                    {r.snapshot.client.name} · {r.snapshot.payment.reference || 'No reference'}
                  </p>
                  <strong>{money(r.snapshot.payment.amount, r.snapshot.currency)}</strong>
                  <p>Balance after payment: {money(r.snapshot.balance, r.snapshot.currency)}</p>
                  {r.superseded && (
                    <p className="cp-superseded">
                      Superseded — this payment was corrected or removed. Kept for reference.
                    </p>
                  )}
                  {!voided && <button onClick={() => download(r)}>Download receipt PDF</button>}
                </article>
              ))}
            </div>
          </section>
        )}
        {!voided && data.gallery && <Gallery {...data.gallery} />}
        <section className="cp-section">
          <p className="cp-kicker">PROJECT CORRESPONDENCE</p>
          <h2>Comments</h2>
          <ol className="cp-comments">
            {data.comments.map((c) => (
              <li key={c.id}>
                <strong>{c.staff ? 'ITZ Engineering' : c.name}</strong>
                <time dateTime={c.created_at}>
                  {new Date(c.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Kampala' })}
                </time>
                <p>{c.message}</p>
              </li>
            ))}
          </ol>
          {!data.comments.length && <p>No comments yet. Leave a note for ITZ Engineering.</p>}
          {sent ? (
            <p role="status">
              Your comment was sent.{' '}
              <button onClick={() => window.location.reload()}>Refresh conversation</button>
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const values = Object.fromEntries(new FormData(form));
                const parsed = commentInput.safeParse(values);
                if (!parsed.success) {
                  setError('Enter a name (1–80 characters) and message (1–1000 characters).');
                  return;
                }
                setBusy(true);
                setError('');
                try {
                  const res = await fetch(`/api/client-comments/${token}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(parsed.data),
                  });
                  const body = await res.json();
                  if (!res.ok) throw new Error(body.error);
                  setSent(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not send comment.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Your name
                <input name="name" required maxLength={80} autoComplete="name" />
              </label>
              <label>
                Message
                <textarea name="message" required maxLength={1000} rows={4} />
              </label>
              <label className="cp-honeypot" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <button className="cp-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Send comment'}
              </button>
            </form>
          )}
        </section>
        <footer>
          <strong>ITZ ENGINEERING</strong>
          <p>Built with care. Delivered with precision.</p>
          <a href={`tel:${doc.company.phone}`}>{doc.company.phone}</a>
          <a href={`mailto:${doc.company.email}`}>{doc.company.email}</a>
        </footer>
      </div>
    </main>
  );
}
