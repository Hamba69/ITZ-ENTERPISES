import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { workspaceSchema } from '@/lib/business';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function shareToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function readPayload(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 5_000_000)
    throw new Error('Workspace exceeds 5 MB. Export an archive first.');

  const raw = await request.text();
  if (raw.length > 5_000_000) throw new Error('Workspace exceeds 5 MB.');

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('data' in body))
    throw new Error('Invalid workspace data.');
  const parsed = workspaceSchema.safeParse(body.data);
  if (!parsed.success) throw new Error('Invalid workspace data.');
  return { body, data: parsed.data };
}

function originIsValid(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const token = shareToken(request);
  if (!token) return reply({ error: 'A valid shared workspace link is required.' }, 401);

  const db = await createClient();
  const { data, error } = await db.rpc('itz_get_shared_workspace', {
    p_token_hash: tokenHash(token),
  });
  if (error)
    return reply(
      {
        error:
          'Shared workspace storage is unavailable. Check the Supabase migration and Data API setup.',
      },
      503,
    );
  const workspace = Array.isArray(data) ? data[0] : null;
  if (!workspace)
    return reply({ error: 'This shared workspace link is invalid or unavailable.' }, 404);
  return reply(workspace);
}

export async function POST(request: NextRequest) {
  if (!originIsValid(request)) return reply({ error: 'Invalid request origin.' }, 403);

  let parsed;
  try {
    parsed = await readPayload(request);
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : 'Invalid workspace data.' },
      400,
    );
  }

  const token = randomBytes(32).toString('base64url');
  const db = await createClient();
  const { data, error } = await db.rpc('itz_create_shared_workspace', {
    p_token_hash: tokenHash(token),
    payload: parsed.data,
  });
  if (error)
    return reply(
      {
        error:
          'Could not create a shared workspace in Supabase. Your current data has not changed.',
      },
      503,
    );
  return reply({ token, version: data });
}

export async function PUT(request: NextRequest) {
  if (!originIsValid(request)) return reply({ error: 'Invalid request origin.' }, 403);
  const token = shareToken(request);
  if (!token) return reply({ error: 'A valid shared workspace link is required.' }, 401);

  let parsed;
  try {
    parsed = await readPayload(request);
  } catch (error) {
    return reply(
      { error: error instanceof Error ? error.message : 'Invalid workspace data.' },
      400,
    );
  }
  const expectedVersion = 'version' in parsed.body ? parsed.body.version : null;
  if (
    typeof expectedVersion !== 'number' ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1
  )
    return reply({ error: 'Invalid workspace version.' }, 400);

  const db = await createClient();
  const { data, error } = await db.rpc('itz_save_shared_workspace', {
    p_token_hash: tokenHash(token),
    payload: parsed.data,
    expected_version: expectedVersion,
  });
  if (error)
    return reply(
      {
        error:
          error.code === '40001'
            ? 'This workspace changed on another device. Your changes are still in this form; copy them, reload to get the latest data, then reapply them.'
            : 'Could not save to Supabase. Your changes have not been saved.',
      },
      error.code === '40001' ? 409 : 503,
    );
  return reply({ version: data });
}
