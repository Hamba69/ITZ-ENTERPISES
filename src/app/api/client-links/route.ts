import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authorizeAdmin } from '@/lib/auth/admin';
import { hashToken, reconcileReceipts } from '@/lib/client-link-server';
import { readClientRequest, reply } from '@/lib/client-request';
export const dynamic = 'force-dynamic';
export async function GET() {
  const access = await authorizeAdmin();
  if (!access.ok) return reply({ error: access.message }, access.status);
  const [links, comments, galleries, media] = await Promise.all([
    access.client.from('itz_client_links').select('*'),
    access.client.from('itz_client_comments').select('*').order('created_at'),
    access.client.from('itz_galleries').select('*').order('title'),
    access.client.from('itz_gallery_media').select('*').order('position'),
  ]);
  if ([links, comments, galleries, media].some((r) => r.error))
    return reply({ error: 'Client links unavailable. Check the migration.' }, 503);
  const paths = (media.data || []).filter((m) => m.ready).map((m) => m.poster_path || m.path);
  const signed = paths.length
    ? await access.client.storage.from('itz-project-media').createSignedUrls(paths, 3600)
    : null;
  const previews = new Map(signed?.data?.map((item) => [item.path, item.signedUrl]) || []);
  return reply({
    links: links.data?.map((l) => ({
      ...l,
      unread: comments.data?.filter((c) => c.link_id === l.id && !c.staff && !c.read_at).length,
    })),
    comments: comments.data,
    galleries: galleries.data,
    media: media.data?.map((m) => ({ ...m, url: previews.get(m.poster_path || m.path) })),
  });
}
const input = z.object({
  action: z.enum([
    'create',
    'regenerate',
    'revoke',
    'settings',
    'reply',
    'hide',
    'delete',
    'read',
    'retry',
  ]),
  document: z.string().min(1).max(100).optional(),
  link: z.uuid().optional(),
  comment: z.uuid().optional(),
  message: z.string().trim().min(1).max(1000).optional(),
  expires: z.iso.datetime().nullable().optional(),
  gallery: z.uuid().nullable().optional(),
});
export async function POST(request: NextRequest) {
  try {
    const body = input.parse(await readClientRequest(request));
    const access = await authorizeAdmin();
    if (!access.ok) return reply({ error: access.message }, access.status);
    let error;
    if (['create', 'regenerate', 'revoke', 'settings'].includes(body.action)) {
      if (!body.document) return reply({ error: 'Document required' }, 400);
      const token = randomBytes(32).toString('base64url');
      ({ error } = await access.client.rpc('itz_manage_client_link', {
        p_document: body.document,
        p_action: body.action,
        p_hash: hashToken(token),
        p_token: token,
        p_expiry: body.expires ?? null,
        p_gallery: body.gallery ?? null,
      }));
    } else if (body.action === 'reply' && body.link && body.message) {
      ({ error } = await access.client.rpc('itz_reply_client', {
        p_link: body.link,
        p_message: body.message,
      }));
    } else if (body.action === 'hide' && body.comment) {
      ({ error } = await access.client
        .from('itz_client_comments')
        .update({ hidden: true })
        .eq('id', body.comment));
    } else if (body.action === 'delete' && body.comment) {
      ({ error } = await access.client.from('itz_client_comments').delete().eq('id', body.comment));
    } else if (body.action === 'read' && body.link) {
      ({ error } = await access.client
        .from('itz_client_comments')
        .update({ read_at: new Date().toISOString() })
        .eq('link_id', body.link)
        .is('read_at', null));
    } else if (body.action !== 'retry') return reply({ error: 'Invalid action' }, 400);
    if (error)
      return reply(
        {
          error: error.message.includes('another client')
            ? 'This gallery belongs to another client. Create a new gallery for this client.'
            : error.message.includes('retired')
              ? 'This link was permanently retired to protect client information. Create a new document and client link.'
              : 'Action failed. Check the link and try again.',
        },
        400,
      );
    if (['create', 'regenerate', 'retry'].includes(body.action)) {
      try {
        await reconcileReceipts(access.client);
      } catch {
        return reply({
          warning:
            'Link saved, but receipts need synchronisation. Retry receipt sync before sharing.',
        });
      }
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: 'Invalid request. Check the fields and request origin.' }, 400);
  }
}
