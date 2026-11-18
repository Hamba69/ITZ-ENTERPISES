import { notFound } from 'next/navigation';
import { ClientPageView } from '@/components/client-page-view';
import { clientFixture } from '@/lib/client-fixture';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default function Fixture() {
  // Runtime-only, explicitly forbidden on hosted deployments. Never enable on a public server.
  if (
    process.env.ITZ_CLIENT_FIXTURES !== '1' ||
    process.env.VERCEL ||
    process.env.ITZ_DEPLOYMENT === 'production'
  )
    notFound();
  return <ClientPageView data={clientFixture()} token={'f'.repeat(43)} />;
}
