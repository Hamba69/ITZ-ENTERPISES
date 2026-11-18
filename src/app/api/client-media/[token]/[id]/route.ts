import { NextRequest } from 'next/server';
import { anonymousClient, hashToken, validToken } from '@/lib/client-link-server';
export const dynamic = 'force-dynamic';
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const unavailable = () =>
    new Response('Unavailable', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const { token, id } = await context.params;
  if (!validToken(token) || !/^[0-9a-f-]{36}$/.test(id)) return unavailable();
  try {
    const hash = hashToken(token),
      client = anonymousClient(hash);
    const { data: path, error } = await client.rpc('itz_client_media_path', {
      p_hash: hash,
      p_id: id,
      p_poster: request.nextUrl.searchParams.get('poster') === '1',
    });
    if (error || !path) return unavailable();
    const { data } = await client.storage.from('itz-project-media').createSignedUrl(path, 60);
    if (!data) return unavailable();
    const range = request.headers.get('range');
    const upstream = await fetch(data.signedUrl, {
      cache: 'no-store',
      headers: range ? { Range: range } : {},
    });
    if (!upstream.ok) return unavailable();
    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return unavailable();
  }
}
