import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { workspaceSchema } from './business';
import { receiptChanges, type Receipt, type ClientPageData } from './client-links';
export const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function anonymousClient(hash?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: hash ? { 'x-client-link-hash': hash } : {},
        fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
      },
    },
  );
}
export async function reconcileReceipts(client: SupabaseClient) {
  const { data: workspace, error } = await client
    .from('itz_workspaces')
    .select('data,version')
    .single();
  if (error) throw new Error('Receipt sync unavailable');
  const w = workspaceSchema.parse(workspace.data);
  const { data: links, error: linksError } = await client
    .from('itz_client_links')
    .select('id,document_id')
    .is('disabled_at', null);
  if (linksError) throw new Error('Receipt sync unavailable');
  for (const link of links || []) {
    const doc = w.documents.find((d) => d.id === link.document_id);
    if (!doc) continue;
    const { data: receipts, error: receiptError } = await client
      .from('itz_receipts')
      .select('*')
      .eq('link_id', link.id);
    if (receiptError) throw new Error('Receipt sync unavailable');
    const changes = receiptChanges(doc, receipts as Receipt[]);
    const { error: syncError } = await client.rpc('itz_sync_receipts', {
      p_link: link.id,
      p_version: workspace.version,
      p_changes: changes,
    });
    if (syncError) throw new Error('Receipt sync requires retry');
  }
}
export async function getClientPage(token: string): Promise<ClientPageData | null> {
  if (!validToken(token)) return null;
  try {
    const { data, error } = await anonymousClient().rpc('itz_get_client_page_v2', {
      p_hash: hashToken(token),
    });
    if (error || !data) return null;
    if (data.gallery)
      data.gallery.media = data.gallery.media.map((m: { id: string; poster_path?: string }) => ({
        ...m,
        url: `/api/client-media/${token}/${m.id}`,
        poster: m.poster_path ? `/api/client-media/${token}/${m.id}?poster=1` : undefined,
        path: undefined,
        poster_path: undefined,
      }));
    return data;
  } catch {
    return null;
  }
}
