import { NextRequest, NextResponse } from 'next/server';
export function reply(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
export async function readClientRequest(request: NextRequest, limit = 16000) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    throw new Error('Invalid request origin');
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Request too large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Request too large');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
