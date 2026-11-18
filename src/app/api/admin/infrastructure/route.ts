import { NextResponse } from 'next/server';
import { authorizeAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET() {
  const access = await authorizeAdmin();
  if (!access.ok) return reply({ error: access.message }, access.status);
  if (access.role !== 'technical_admin')
    return reply({ error: 'Technical administrator access is required.' }, 403);

  const { error } = await access.client.from('itz_workspaces').select('owner_id').limit(1);
  return reply({
    deployment: {
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      url: process.env.VERCEL_URL || 'Not reported',
      region: process.env.VERCEL_REGION || 'Not reported',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'Not reported',
      runtime: `Node.js ${process.version}`,
    },
    services: {
      supabaseAuth: 'Connected',
      workspaceDatabase: error ? 'Unavailable' : 'Connected',
      workspaceDatabaseDetail: error
        ? 'Workspace table query failed. Check the Supabase migration and Data API setup.'
        : 'Workspace table query succeeded.',
    },
  });
}
