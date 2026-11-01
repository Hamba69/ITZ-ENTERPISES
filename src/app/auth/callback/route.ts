import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          request.nextUrl.searchParams.get('recovery') === '1' ? '/?recovery=1' : '/?confirmed=1',
          request.url,
        ),
      );
  }
  return NextResponse.redirect(new URL('/?auth_error=link_expired', request.url));
}
