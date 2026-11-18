import { z } from 'zod';
import { totals, type Invoice } from './business';

export const commentInput = z.object({
  name: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1000),
  website: z.string().max(0).default(''),
});
export type ReceiptSnapshot = {
  number: string;
  payment: Invoice['payments'][number];
  invoiceNumber: string;
  client: Pick<Invoice['client'], 'name'>;
  company: Invoice['company'];
  currency: Invoice['currency'];
  font: Invoice['font'];
  template: Invoice['template'];
  balance: number;
};
export type Receipt = {
  id: string;
  sequence: number;
  payment_id: string;
  snapshot: ReceiptSnapshot;
  superseded: boolean;
};
export function receiptChanges(doc: Invoice, existing: Receipt[]) {
  let sequence = Math.max(0, ...existing.map((r) => r.sequence));
  const samePayment = (a: Invoice['payments'][number], b: Invoice['payments'][number]) =>
    a.id === b.id &&
    a.amount === b.amount &&
    a.date === b.date &&
    a.method === b.method &&
    a.reference === b.reference;
  const supersede = existing
    .filter((r) => !r.superseded && !doc.payments.some((p) => samePayment(p, r.snapshot.payment)))
    .map((r) => r.id);
  const additions =
    doc.kind !== 'invoice'
      ? []
      : doc.payments.flatMap((payment, index) => {
          if (existing.some((r) => !r.superseded && samePayment(payment, r.snapshot.payment)))
            return [];
          sequence++;
          return [
            {
              sequence,
              payment_id: payment.id,
              snapshot: {
                number: `R-${doc.number}-${String(sequence).padStart(2, '0')}`,
                payment,
                invoiceNumber: doc.number,
          client: { name: doc.client.name },
                company: doc.company,
                currency: doc.currency,
                font: doc.font,
                template: doc.template,
                balance: totals({ ...doc, payments: doc.payments.slice(0, index + 1) }).balance,
              },
            },
          ];
        });
  return { supersede, additions };
}
export type ClientComment = {
  id: string;
  name: string;
  message: string;
  staff: boolean;
  created_at: string;
  hidden?: boolean;
  read_at?: string | null;
};
export type GalleryMedia = {
  id: string;
  kind: 'image' | 'video';
  caption: string;
  width: number;
  height: number;
  bytes: number;
  position: number;
  url: string;
  poster?: string;
  path?: string;
  poster_path?: string;
  duration?: number;
};
export type ClientPageData = {
  document: Invoice;
  revisedAt: string | null;
  receipts: Receipt[];
  comments: ClientComment[];
  gallery: { title: string; media: GalleryMedia[] } | null;
};
export type ClientLink = {
  id: string;
  document_id: string;
  raw_token: string;
  revoked_at: string | null;
  expires_at: string | null;
  gallery_id: string | null;
  view_count: number;
  last_viewed_at: string | null;
  unread: number;
};
