import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authorizeAdmin } from '@/lib/auth/admin';
import { readClientRequest, reply } from '@/lib/client-request';
const input = z.object({
  action: z.enum(['create', 'reserve', 'complete', 'edit', 'delete']),
  id: z.uuid().optional(),
  gallery: z.uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(['image', 'video']).optional(),
  extension: z.enum(['jpg', 'webp', 'mp4', 'webm', 'mov']).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  bytes: z.number().int().positive().max(31_000_000).optional(),
  duration: z.number().min(0).max(90).optional(),
  caption: z.string().max(200).optional(),
  position: z.number().int().min(0).max(10000).optional(),
});
export async function POST(request: NextRequest) {
  try {
    const b = input.parse(await readClientRequest(request));
    const a = await authorizeAdmin();
    if (!a.ok) return reply({ error: a.message }, a.status);
    if (b.action === 'create' && b.title) {
      const { data, error } = await a.client
        .from('itz_galleries')
        .insert({ owner_id: a.user.id, title: b.title })
        .select('id')
        .single();
      if (error) throw error;
      return reply(data);
    }
    if (
      b.action === 'reserve' &&
      b.gallery &&
      b.kind &&
      b.extension &&
      b.width &&
      b.height &&
      b.bytes
    ) {
      if ((b.kind === 'image') !== ['jpg', 'webp'].includes(b.extension)) throw new Error();
      const id = crypto.randomUUID(),
        path = `${a.user.id}/${b.gallery}/${id}.${b.extension}`;
      const poster_path =
        b.kind === 'video' ? `${a.user.id}/${b.gallery}/${crypto.randomUUID()}.jpg` : null;
      const { error } = await a.client
        .from('itz_gallery_media')
        .insert({
          id,
          owner_id: a.user.id,
          gallery_id: b.gallery,
          kind: b.kind,
          path,
          poster_path,
          width: b.width,
          height: b.height,
          bytes: b.bytes,
          duration: b.duration || 0,
          position: b.position || 0,
        });
      if (error) throw error;
      return reply({ id, path, poster_path });
    }
    if (!b.id) throw new Error();
    const { data: media, error: lookupError } = await a.client
      .from('itz_gallery_media')
      .select('*')
      .eq('id', b.id)
      .single();
    if (lookupError || !media) throw new Error();
    if (b.action === 'delete') {
      const { error } = await a.client.storage
        .from('itz-project-media')
        .remove([media.path, media.poster_path].filter(Boolean));
      if (error) throw error;
      const result = await a.client.from('itz_gallery_media').delete().eq('id', b.id);
      if (result.error) throw result.error;
    } else if (b.action === 'complete') {
      // Verify stored sizes before publication. Reservations include poster bytes.
      let bytes = 0;
      for (const path of [media.path, media.poster_path].filter(Boolean)) {
        const { data, error } = await a.client.storage.from('itz-project-media').info(path);
        if (error || !data || !data.size) throw new Error();
        bytes += data.size;
      }
      if (bytes > media.bytes) throw new Error();
      const result = await a.client
        .from('itz_gallery_media')
        .update({ ready: true, bytes })
        .eq('id', b.id);
      if (result.error) throw result.error;
    } else if (b.action === 'edit') {
      const result = await a.client
        .from('itz_gallery_media')
        .update({ caption: b.caption, position: b.position })
        .eq('id', b.id);
      if (result.error) throw result.error;
    } else throw new Error();
    return reply({ ok: true });
  } catch {
    return reply(
      {
        error: 'Gallery action failed. Check capacity, file limits and storage setup, then retry.',
      },
      400,
    );
  }
}
