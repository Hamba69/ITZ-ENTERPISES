import { NextRequest, NextResponse } from 'next/server';
import { authorizeAdmin } from '@/lib/auth/admin';
import { emptyWorkspace, workspaceSchema, type Workspace } from '@/lib/business';
import { mergeWorkspaces } from '@/lib/workspace-merge';
import { reconcileReceipts } from '@/lib/client-link-server';
import { createClient as createReceiptClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return reply({ error: 'Invalid request origin.' }, 403);
  if (Number(request.headers.get('content-length')) > 5_000_000)
    return reply({ error: 'Workspace exceeds 5 MB. Export an archive first.' }, 413);

  const access = await authorizeAdmin();
  if (!access.ok) return reply({ error: access.message }, access.status);

  let incoming: Workspace;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 5_000_000) return reply({ error: 'Workspace exceeds 5 MB.' }, 413);
    const body = JSON.parse(raw);
    const parsed = workspaceSchema.safeParse(body?.data);
    if (!parsed.success) return reply({ error: 'Invalid workspace data.' }, 400);
    incoming = parsed.data;
  } catch {
    return reply({ error: 'Invalid workspace data.' }, 400);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error: readError } = await access.client
      .from('itz_workspaces')
      .select('data,version')
      .eq('owner_id', access.workspaceOwnerId)
      .maybeSingle();
    if (readError) return reply({ error: 'Could not load the shared workspace.' }, 503);

    let existing: Workspace;
    try {
      existing = current ? workspaceSchema.parse(current.data) : emptyWorkspace();
    } catch {
      return reply({ error: 'The saved workspace is invalid. No local data was merged.' }, 503);
    }

    const merged = mergeWorkspaces(existing, incoming);
    if (!merged.ok)
      return reply(
        {
          error:
            'Some local records conflict with the shared workspace. Nothing was merged; the local data remains on this device.',
        },
        409,
      );

    if (current && JSON.stringify(existing) === JSON.stringify(merged.data))
      return reply({ version: current.version, merged: false });

    const { data: version, error: saveError } = await access.client.rpc('itz_save_workspace', {
      payload: merged.data,
      expected_version: current?.version ?? 0,
    });
    if (!saveError) {
      let receiptWarning: string | undefined;
      try {
        await reconcileReceipts(await createReceiptClient());
      } catch {
        receiptWarning = 'Records synced. Client receipts need synchronisation; retry receipt sync before sharing.';
      }
      return reply({ version, merged: true, receiptWarning });
    }
    if (saveError.code !== '40001') return reply({ error: 'Could not sync local records.' }, 503);
  }

  return reply({ error: 'The shared workspace changed repeatedly. Retry the sync.' }, 409);
}
