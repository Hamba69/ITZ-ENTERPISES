'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money, totals, type Invoice } from '@/lib/business';
import type { ClientComment, ClientLink, GalleryMedia } from '@/lib/client-links';
import { prepareMedia, validateGallery } from '@/lib/project-media';
import { Modal, Field } from './ui';
type OwnerMedia = GalleryMedia & { gallery_id: string; ready: boolean };
export type LinkState = {
  links: ClientLink[];
  comments: (ClientComment & { link_id: string })[];
  galleries: { id: string; title: string }[];
  media: OwnerMedia[];
};
export const emptyLinks: LinkState = { links: [], comments: [], galleries: [], media: [] };
export async function linkAction(body: object, endpoint = '/api/client-links') {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Action failed');
  return data;
}
async function upload(path: string, blob: Blob, progress: (n: number) => void) {
  const { data } = await createClient().auth.getSession();
  if (!data.session) throw new Error('Sign in to upload.');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      'POST',
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/itz-project-media/${path}`,
    );
    xhr.setRequestHeader('Authorization', `Bearer ${data.session!.access_token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    xhr.setRequestHeader('Content-Type', blob.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('Upload rejected. Check bucket permissions and limits.'));
    xhr.send(blob);
  });
}
export function ClientLinkDialog({
  doc,
  state,
  refresh,
  onClose,
}: {
  doc: Invoice;
  state: LinkState;
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const link = state.links.find((l) => l.document_id === doc.id);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [progress, setProgress] = useState(0);
  const [expiry, setExpiry] = useState(link?.expires_at?.slice(0, 10) || ''),
    [gallery, setGallery] = useState(link?.gallery_id || '');
  const media = state.media.filter((m) => m.gallery_id === gallery),
    comments = state.comments.filter((c) => c.link_id === link?.id);
  useEffect(() => {
    if (link)
      void linkAction({ action: 'read', link: link.id })
        .then(refresh)
        .catch(() => setMessage('Could not mark comments as read.'));
  }, [link?.id]);
  async function act(body: object, endpoint?: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await linkAction(body, endpoint);
      await refresh();
      setMessage(result.warning || 'Saved.');
      return result;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }
  async function files(list: FileList | null) {
    if (!list || !gallery || busy) return;
    setBusy(true);
    const current = [...media];
    try {
      for (const file of Array.from(list)) {
        setMessage(`Preparing ${file.name}`);
        setProgress(0);
        const p = await prepareMedia(file),
          bytes = p.blob.size + (p.poster?.size || 0);
        validateGallery(current, { kind: p.kind, bytes });
        const position = Math.max(-1, ...current.map((m) => m.position)) + 1;
        const r = await linkAction(
          {
            action: 'reserve',
            gallery,
            kind: p.kind,
            extension: p.extension,
            width: p.width,
            height: p.height,
            duration: p.duration,
            bytes,
            position,
          },
          '/api/client-galleries',
        );
        try {
          setMessage(`Uploading ${file.name}`);
          await upload(r.path, p.blob, setProgress);
          if (p.poster) await upload(r.poster_path, p.poster, () => {});
          await linkAction({ action: 'complete', id: r.id }, '/api/client-galleries');
          current.push({ id: r.id, kind: p.kind, bytes, position } as OwnerMedia);
        } catch (e) {
          try {
            await linkAction({ action: 'delete', id: r.id }, '/api/client-galleries');
          } catch {
            /* Failed reservation remains visible for cleanup. */
          }
          throw e;
        }
      }
      setMessage('Upload complete.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      try {
        await refresh();
      } catch {
        setMessage('Could not refresh gallery status. Close and reopen the client link to retry.');
      } finally {
        setBusy(false);
      }
    }
  }
  if (!link)
    return (
      <Modal title="Client link" onClose={onClose}>
        <p>Link unavailable. Close and try again.</p>
      </Modal>
    );
  const url = `${window.location.origin}/c/${link.raw_token}`,
    share = `${doc.number} — ${money(totals(doc).total, doc.currency)}\n${url}`;
  return (
    <Modal title="Client link" onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 16 }}>
        {(link.revoked_at || (link.expires_at && new Date(link.expires_at) <= new Date())) && (
          <p>This link is revoked or expired. Regenerate or update its expiry before sharing.</p>
        )}
        <Field label="Private client URL">
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
        </Field>
        <div className="actions">
          <button
            className="button"
            onClick={() =>
              navigator.clipboard
                .writeText(url)
                .then(() => setMessage('Copied.'))
                .catch(() => setMessage('Select the URL and copy it manually.'))
            }
          >
            Copy
          </button>
          <a className="button" href={url} target="_blank" rel="noreferrer">
            Open page
          </a>
          <a
            className="button"
            href={`https://wa.me/?text=${encodeURIComponent(share)}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp share
          </a>
          <a
            className="button"
            href={`mailto:${encodeURIComponent(doc.client.email)}?subject=${encodeURIComponent(doc.number + ' · ' + doc.company.name)}&body=${encodeURIComponent(`Hello ${doc.client.name},\n\n${share}\n\n${doc.company.name}\n${doc.company.phone}`)}`}
          >
            Email draft
          </a>
        </div>
        <p>
          {link.view_count} views · Last viewed:{' '}
          {link.last_viewed_at
            ? new Date(link.last_viewed_at).toLocaleString('en-GB')
            : 'Not yet viewed'}
          <br />
          <small>Views counted at most once every ten minutes.</small>
        </p>
        <Field label="Optional expiry (end of day, Uganda time)">
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            act({
              action: 'settings',
              document: doc.id,
              expires: expiry ? new Date(`${expiry}T23:59:59+03:00`).toISOString() : null,
              gallery: gallery || null,
            })
          }
        >
          Save expiry and gallery
        </button>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              if (confirm('Regenerate this link? The old URL will stop working.'))
                void act({ action: 'regenerate', document: doc.id });
            }}
          >
            Regenerate
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              if (confirm('Revoke this client link?'))
                void act({ action: 'revoke', document: doc.id });
            }}
          >
            Revoke
          </button>
          <button className="button" disabled={busy} onClick={() => act({ action: 'retry' })}>
            Retry receipt sync
          </button>
        </div>
        <h3>Project gallery</h3>
        <Field label="Attached gallery">
          <select
            value={gallery}
            disabled={busy}
            onChange={async (e) => {
              const value = e.target.value;
              if (value === 'new') {
                const title = prompt('Gallery title', doc.project || 'Project gallery');
                if (title) {
                  const result = await act({ action: 'create', title }, '/api/client-galleries');
                  if (result) {
                    setGallery(result.id);
                    await act({
                      action: 'settings',
                      document: doc.id,
                      expires: link.expires_at,
                      gallery: result.id,
                    });
                  }
                }
              } else {
                setGallery(value);
                await act({
                  action: 'settings',
                  document: doc.id,
                  expires: link.expires_at,
                  gallery: value || null,
                });
              }
            }}
          >
            <option value="">None</option>
            {state.galleries.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
            <option value="new">+ New gallery</option>
          </select>
        </Field>
        {gallery && (
          <>
            <p>
              {(media.reduce((n, m) => n + m.bytes, 0) / 1_000_000).toFixed(1)} / 150 MB ·{' '}
              {media.filter((m) => m.kind === 'image').length}/40 photos ·{' '}
              {media.filter((m) => m.kind === 'video').length}/6 videos
            </p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void files(e.dataTransfer.files);
              }}
              style={{ padding: 20, border: '1px dashed #65798c' }}
            >
              <Field label="Drop files here or choose photos / videos">
                <input
                  type="file"
                  multiple
                  accept="image/*,video/mp4,video/webm,video/quicktime"
                  disabled={busy}
                  onChange={(e) => {
                    void files(e.target.files);
                    e.target.value = '';
                  }}
                />
              </Field>
              <small>
                Photos: 15 MB input, resized to 1600 px. Videos: 30 MB, 90 seconds; MP4, WebM or
                MOV.
              </small>
            </div>
            {busy && <progress max={100} value={progress} aria-label="Upload progress" />}
            {media.map((m, i) => (
              <div key={m.id}>
            {m.url && <img src={m.url} alt={m.caption || `Project ${m.kind}`} width={160} height={100} style={{objectFit:'cover',display:'block'}} />}
            <strong>
                  {i + 1}. {m.kind} {m.ready ? '' : '(Incomplete upload — delete and retry)'}
                </strong>
                <Field label="Caption">
                  <input
                    maxLength={200}
                    defaultValue={m.caption}
                    onBlur={(e) => {
                      if (e.target.value !== m.caption)
                        void act(
                          { action: 'edit', id: m.id, caption: e.target.value },
                          '/api/client-galleries',
                        );
                    }}
                  />
                </Field>
                <div className="actions">
                  <button
                    className="button"
                    disabled={busy || i === 0}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const ordered = [...media];
                        [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]];
                        for (let j = 0; j < ordered.length; j++)
                          await linkAction(
                            { action: 'edit', id: ordered[j].id, position: j },
                            '/api/client-galleries',
                          );
                        await refresh();
                      } catch {
                        setMessage('Reorder failed. Refresh and retry.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Move up
                  </button>
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm('Delete this media from every document using this gallery?'))
                        void act({ action: 'delete', id: m.id }, '/api/client-galleries');
                    }}
                  >
                    Delete media
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
        <h3>Comments</h3>
        {comments.map((c) => (
          <article key={c.id}>
            <strong>{c.staff ? 'ITZ Engineering' : c.name}</strong> ·{' '}
            {new Date(c.created_at).toLocaleString('en-GB')}
            {c.hidden && ' · Hidden'}
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.message}</p>
            <div className="actions">
              <button
                className="button"
                disabled={busy || c.hidden}
                onClick={() => act({ action: 'hide', comment: c.id })}
              >
                Hide
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  if (confirm('Delete this comment permanently?'))
                    void act({ action: 'delete', comment: c.id });
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const result = await act({
              action: 'reply',
              link: link.id,
              message: new FormData(form).get('message'),
            });
            if (result) form.reset();
          }}
        >
          <Field label="Reply as ITZ Engineering">
            <textarea name="message" required maxLength={1000} rows={3} />
          </Field>
          <button className="button primary" disabled={busy}>
            Send reply
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>
  );
}
