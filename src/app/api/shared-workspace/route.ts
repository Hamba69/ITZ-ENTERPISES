import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
function retired() {
  return NextResponse.json(
    { error: 'Separate workspaces have been retired. Sign in to use the shared cloud workspace.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export const GET = retired;
export const POST = retired;
export const PUT = retired;
