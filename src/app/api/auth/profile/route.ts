import { NextResponse } from 'next/server';
import { authorizeAdmin } from '@/lib/auth/admin';
import { getAdminDisplayName } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await authorizeAdmin();
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  return NextResponse.json(
    {
      email: access.user.email,
      role: access.role,
      displayName: getAdminDisplayName(access.role),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
