import { ClientPageView } from '@/components/client-page-view';
import { getClientPage } from '@/lib/client-link-server';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ITZ Engineering | Client document',
  robots: { index: false, follow: false },
};
export default async function ClientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getClientPage(token);
  if (!data)
    return (
      <main className="client-page">
        <div className="cp-shell">
          <h1>This link is unavailable</h1>
          <p>Please contact ITZ Engineering for a current link.</p>
        </div>
      </main>
    );
  return <ClientPageView data={data} token={token} />;
}
