import { NextRequest } from 'next/server';
import { anonymousClient, hashToken, validToken } from '@/lib/client-link-server';
import { commentInput } from '@/lib/client-links';
import { readClientRequest, reply } from '@/lib/client-request';
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = commentInput.parse(await readClientRequest(request, 8000));
    if (!validToken(token)) return reply({ error: 'This link is unavailable' }, 404);
    const { error } = await anonymousClient().rpc('itz_add_client_comment', {
      p_hash: hashToken(token),
      p_name: body.name,
      p_message: body.message,
    });
    if (error)
      return reply(
        {
          error:
            'Comment unavailable. The link may have expired or the comment limit was reached. Please try later.',
        },
        429,
      );
    return reply({ ok: true });
  } catch {
    return reply({ error: 'Enter a name (1–80 characters) and message (1–1000 characters).' }, 400);
  }
}
