import type { Metadata } from 'next';
import '@fontsource/work-sans/400.css';
import '@fontsource/work-sans/500.css';
import '@fontsource/work-sans/600.css';
import '@fontsource/work-sans/700.css';
import '@fontsource/orbitron/700.css';
import './globals.css';
export const metadata: Metadata = {
  title: 'ITZ Studio | Invoices & Business',
  description:
    'The business workspace for ITZ Engineering. Quotations, invoices, clients and cash flow.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
