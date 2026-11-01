# ITZ Business Studio

A complete Next.js workspace for **ITZ Engineering / I.T.Z Metal Works Ltd**. The original company identity, contacts, blue/orange colours, UGX default and engineering measurement schedules are preserved from `ITZ_INVOICESXYZ_updated.html`. That source file remains unchanged.

## Run locally

Requires Node.js 20.9 or later (Node 24 recommended).

```powershell
npm install
npm run dev
```

Open **http://localhost:3000**. Dependencies are already installed in this workspace. `.env.local` contains the supplied Supabase URL and publishable key and is excluded from version control. On another computer, copy `.env.example` to `.env.local` and enter the publishable key.

For a production build:

```powershell
npm run build
npm start
```

## What you can do

- Create, edit and save draft invoices and quotations; issue documents, duplicate them, convert quotations to invoices, and void unpaid issued documents.
- Add real itemised rows with description, specification, quantity, unit, unit price and calculated amount. Reorder rows or reuse saved catalogue items.
- Apply a percentage discount before tax. Set the applicable tax rate explicitly; the default is zero.
- Use UGX, KES, USD, EUR, GBP, JPY or INR. Monetary amounts are rounded in each currency; currencies are never silently converted or summed together.
- Choose Industrial, Forge, Editorial or Blueprint designs and sans, serif or monospace document typography.
- Add multiple measurement schedules with custom column names and rows. Display them before or after the items, or hide them. Measurement schedules are descriptive, not formulas.
- Preview complete documents, print A4 documents and download searchable, paginated PDFs. PDF export uses portable Helvetica, Times or Courier; screen previews use locally hosted Work Sans, Georgia or Courier. Typographic multiplication signs and dashes are normalised in PDF text. Browser print preserves the exact screen template styling.
- Open a prefilled email in your mail application. Download and attach the PDF before sending; the app does not automatically send mail.
- Maintain a client book and reusable item/service library.
- Record partial and full payments, payment methods, dates and references. Correct an incorrect payment entry. This is bookkeeping, not payment processing or a refund service.
- Record paid expenses, view cash received, outstanding/overdue amounts, net cash movement, six-month cash charts and category spending.
- Search/filter documents, search records, export document and expense CSVs, and back up/restore the complete workspace as validated JSON.

Issued documents retain snapshots of the company, client and prices. Editing your business settings or client book does not rewrite existing invoices. Issued documents cannot be edited through the UI: duplicate to revise; void an unpaid incorrect document. Drafts can be deleted. An invoice with payments cannot be voided until erroneous entries are corrected.

## Local, sample and cloud workspaces

**Local mode** works immediately and saves to this browser's local storage. Export JSON backups regularly; clearing browser data removes local records. Other tabs cannot silently overwrite newer local data. Unreadable stored data is left intact and saving is blocked until an explicit valid backup restore. A raw backup export is available for recovery.

**Sample mode** is an explicitly labelled, temporary workspace. Its fictional customers use example.com addresses. It does not overwrite local or cloud records and is discarded on reload. The materials and example prices are derived from the original concept; sample documents are not actual trading records.

**Cloud mode** uses Supabase email/password authentication and a private workspace per user. It opens separately from local data. To move local data, export its JSON backup, connect the cloud account, then restore the backup after reviewing the replacement confirmation. A failed cloud save leaves the form open and does not report success. Conflicting device versions are rejected instead of silently overwriting records.

## Finish the Supabase setup

The app uses project `rmmwkuihqmezwdugttsr`. Its Auth endpoint responded during setup, but the new workspace table was not available through the Data API. The existing CLI account does not have administrative access to this project. **The remote migration has not been applied, and live sign-in/persistence have not been verified.** No service-role key is required by the app.

1. Open the SQL Editor for the supplied Supabase project.
2. Run the complete contents of [`supabase/migrations/20261101160933_itz_business_workspace.sql`](supabase/migrations/20261101160933_itz_business_workspace.sql) once. It creates only `itz_workspaces`, its access policies and `itz_save_workspace`. It does not touch a `todos` table or any existing business tables.
3. Enable email/password sign-in in Authentication. Configure SMTP for reliable confirmation and reset mail before production use.
4. Set the development Site URL to `http://localhost:3000`. Allow the redirect URLs `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?recovery=1`. Add the equivalent HTTPS URLs when deploying.
5. In the app, select **Connect cloud**, create and confirm your account, and sign in. Save a client, reload, reconnect and confirm it persists. Repeat with a second account to verify isolation on the hosted project.
6. Check Supabase's Security Advisors after applying the SQL. The migration's RLS and grants have been exercised against a local PostgreSQL engine, but that does not establish the hosted project's complete configuration.

The SQL is an initial migration; do not run it twice against an already initialised database. If using the Supabase CLI later, link the correct project and align migration history before applying further migrations.

## Data design and boundaries

- Next.js App Router, TypeScript, React, Supabase SSR clients, Zod validation, Decimal.js calculations, jsPDF and AutoTable.
- The cloud database stores one JSONB business aggregate per authenticated owner. This is a deliberate small-workspace design: related changes save atomically and exports use the same validated format. It is not a multi-user organisation/role system or a high-volume accounting database.
- `owner_id` is a primary key and foreign key to Auth users. All access uses the authenticated user's session. RLS restricts SELECT/INSERT/UPDATE to that owner. Anonymous access and TRUNCATE privileges are explicitly revoked.
- `itz_save_workspace` is security-invoker, uses an empty search path and compares the expected version before updating. No service-role key or security-definer bypass is used.
- Application/API validation covers required fields, finite bounded numbers, unique document numbers/IDs, valid dates, currency precision, rectangular schedules and overpayments. The API additionally checks request origin and size. Database constraints enforce ownership, basic aggregate format, version and payload size; the full business schema is validated by the application.
- A workspace is limited to approximately 5 MB. The JSON format is versioned. For high-volume use, evolve to normalised, paginated records and a migration/import process.
- Reports describe recorded cash movement, not statutory accounts, tax filing or inventory stock levels. Quotes, drafts and void documents are excluded from receivables.
- No invoice emails, payment-provider charges, bank reconciliation, automated recurring billing or team invitations are performed.
- Legacy HTML changes were not stored as a browser database and cannot be automatically imported from that file. The new studio uses its own documented backup format.

## Checks

```powershell
npm run typecheck
npm test
npx playwright install chromium --only-shell
npm run build
npm run test:e2e
```

The browser suite starts the production server if one is not already running. After changing source, rebuild before running it. PostgreSQL tests use PGlite to run the actual migration and exercise two-user access isolation, blocked anonymous access and stale-version handling. They do not connect to the hosted database.

Screenshots and downloaded test PDFs are written under ignored `test-results/`. The complete verification results and known limits are recorded in [VERIFICATION.md](VERIFICATION.md).

## Source guide

- `src/components/studio.tsx`: workspace navigation, records, reports and persistence.
- `src/components/document-editor.tsx`: document composition and measurement editor.
- `src/components/document-view.tsx`: invoice/quotation screen and print templates.
- `src/components/record-forms.tsx`: client, catalogue, expense and company forms.
- `src/lib/business.ts`: validation, calculation, statuses and sample fixtures.
- `src/lib/pdf.ts`: paginated PDF generation.
- `src/lib/supabase/`, `src/proxy.ts`, `src/app/auth/`: SSR authentication and refresh.
- `src/app/api/workspace/route.ts`: authenticated cloud persistence.
- `src/app/globals.css`: responsive studio and document design.

Implementation references: [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [password authentication](https://supabase.com/docs/guides/auth/passwords), [Next.js installation](https://nextjs.org/docs/app/getting-started/installation).
