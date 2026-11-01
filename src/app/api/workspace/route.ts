import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { workspaceSchema } from '@/lib/business';
export const dynamic = 'force-dynamic';
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return reply({ error: 'Sign in to open your cloud workspace.' }, 401);
  const { data, error } = await db
    .from('itz_workspaces')
    .select('data,version')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (error)
    return reply(
      { error: 'Cloud workspace unavailable. Check the Supabase migration and Data API setup.' },
      503,
    );
  return reply(data || { data: null, version: 0 });
}
export async function PUT(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin)
    return reply({ error: 'Invalid request origin.' }, 403);
  if (Number(request.headers.get('content-length')) > 5_000_000)
    return reply({ error: 'Workspace exceeds 5 MB. Export an archive first.' }, 413);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return reply({ error: 'Your session expired. Sign in again.' }, 401);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5_000_000) return reply({ error: 'Workspace exceeds 5 MB.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: 'Invalid JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return reply({ error: 'Invalid workspace data.' }, 400);
  const parsed = workspaceSchema.safeParse(body.data);
  if (!parsed.success || !Number.isSafeInteger(body.version) || body.version < 0)
    return reply({ error: 'Invalid workspace data.' }, 400);
  const { data, error } = await db.rpc('itz_save_workspace', {
    payload: parsed.data,
    expected_version: body.version,
  });
  if (error)
    return reply(
      {
        error:
          error.code === '40001'
            ? 'This workspace changed in another tab. Export your backup, then reload before editing.'
            : 'Could not save to Supabase. Your changes have not been saved.',
      },
      error.code === '40001' ? 409 : 503,
    );
  return reply({ version: data });
}
