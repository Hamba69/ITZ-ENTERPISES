import { demoWorkspace } from './business';
import { receiptChanges, type ClientPageData } from './client-links';
export function clientFixture(): ClientPageData {
  const document = demoWorkspace().documents[0];
  document.project = 'Residential entrance / steelwork';
  const receipts = receiptChanges(document, []).additions.map((r, i) => ({
    ...r,
    id: `receipt-${i}`,
    superseded: false,
  }));
  const svg = (colour: string) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="${colour}"/><path d="M80 80H720V420H80ZM200 80V420M400 80V420M600 80V420" fill="none" stroke="#a9b7c3" stroke-width="12"/></svg>`)}`;
  return {
    document,
    receipts,
    revisedAt: '2026-11-17T10:00:00Z',
    comments: [
      {
        id: 'c1',
        name: 'Fixture client',
        message: 'Thank you. Please confirm the installation date.',
        staff: false,
        created_at: '2026-11-17T11:00:00Z',
      },
    ],
    gallery: {
      title: 'Workshop progress',
      media: [
        {
          id: 'm1',
          kind: 'image',
          caption: 'Fabricated frame — fixture illustration',
          width: 800,
          height: 500,
          bytes: 1000,
          position: 0,
          url: svg('#31485c'),
        },
        {
          id: 'm2',
          kind: 'image',
          caption: 'Detail — fixture illustration',
          width: 800,
          height: 500,
          bytes: 1000,
          position: 1,
          url: svg('#46594f'),
        },
      ],
    },
  };
}
