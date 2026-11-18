# ITZ Business Studio

A complete Next.js workspace for **ITZ Engineering / I.T.Z Metal Works Ltd**. The original company identity, contacts, blue/orange colours, UGX default and engineering measurement schedules are preserved from `ITZ_INVOICESXYZ_updated.html`. That source file remains unchanged.

## Run locally

Requires Node.js 20.9 or later (Node 24 recommended).

```powershell
npm install
npm run dev
```

Open **http://localhost:3000**. Dependencies are already installed in this workspace. `.env.local` contains the supplied Supabase URL and publishable key and is excluded from version control. On another computer, copy `.env.example` to `.env.local` and enter the Supabase publishable key. Never put a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

For a production build:

```powershell
npm run build
npm start
```

## What you can do

- Create, edit and save draft invoices and quotations; issue documents, edit issued or paid documents, duplicate them, convert quotations to invoices, and void unpaid issued documents.
- Review a post-issue audit trail on each issued document. Every saved edit, payment change or void records its timestamp, actor, changed fields and the complete previous document version; open any entry to inspect that version.
- Assign audit-friendly document numbers automatically: invoices use `I-ITZ-YYYY-NNN`, quotations use `Q-ITZ-YYYY-NNN`. The year and sequence are system-controlled, sequence numbers advance past the highest existing number for that type and year, and existing document numbers are preserved.
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

Issued documents retain snapshots of the company, client and prices. Editing your business settings or client book does not rewrite existing invoices. Use **Edit document** to revise an issued or paid invoice or quotation; its status and recorded payments remain in place, and the previous version is added to its audit trail. Drafts can be deleted. An invoice with payments cannot be voided until erroneous entries are corrected. Audit history is stored with workspace data and is not cryptographically tamper-proof.

## Local, sample and cloud workspaces

**Local mode** saves to this browser's local storage and does not sync to other devices. Export JSON backups regularly; clearing browser data removes local records. Other tabs cannot silently overwrite newer local data. Unreadable stored data is left intact and saving is blocked until an explicit valid backup restore. A raw backup export is available for recovery.

**Sample mode** is an explicitly labelled, temporary workspace. Its fictional customers use example.com addresses. It does not overwrite local or cloud records and is discarded on reload. The materials and example prices are derived from the original concept; sample documents are not actual trading records.

**Cloud mode** uses Supabase email/password authentication and a private workspace per user. It opens separately from local data. To move local data, export its JSON backup, connect the cloud account, then restore the backup after reviewing the replacement confirmation. A failed cloud save leaves the form open and does not report success. Conflicting device versions are rejected instead of silently overwriting records.

**Shared-link mode** creates a database-backed copy of the current workspace and gives you a link that opens the same data on other devices. Every saved change is written to Supabase, including post-issue document revisions, payments, clients, expenses and settings. Version checks reject stale saves rather than silently overwriting newer changes. The link is a bearer credential: anyone who has it can read, edit and export the entire workspace. It is not a substitute for user authentication, and links cannot currently be revoked. Share it only with trusted people; real authentication and access controls should replace this temporary mode.

## Finish the Supabase setup

The app uses project `rmmwkuihqmezwdugttsr`. Its Auth endpoint responded during setup, but the workspace tables were not available through the Data API. The existing CLI account does not have administrative access to this project. **The remote migrations have not been applied, and live database persistence has not been verified.** No service-role key is required by the app.

1. Open the SQL Editor for the supplied Supabase project.
2. Run the complete contents of [`supabase/migrations/20261101160933_itz_business_workspace.sql`](supabase/migrations/20261101160933_itz_business_workspace.sql), then [`supabase/migrations/20261103100000_itz_shared_link_workspaces.sql`](supabase/migrations/20261103100000_itz_shared_link_workspaces.sql), then [`supabase/migrations/20261118031149_itz_client_links.sql`](supabase/migrations/20261118031149_itz_client_links.sql), once each and in that order. The third adds private client links, receipts, comments and gallery storage. The first creates the private authenticated workspace. The second creates a separate shared-link workspace. Neither migration touches a `todos` table or existing business tables.
3. Enable email/password sign-in in Authentication. Configure SMTP for reliable confirmation and reset mail before production use.
4. Set the development Site URL to `http://localhost:3000`. Allow the redirect URLs `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?recovery=1`. Add the equivalent HTTPS URLs when deploying.
5. In the app, test **Create shareable workspace link** with non-sensitive sample data, then open the copied link in a separate browser/device and confirm changes persist both ways. Anyone holding that link can access all of its data. Also test **Connect cloud** with a confirmed account, save a client, reload, reconnect and confirm it persists. Repeat with a second account to verify isolation on the hosted project.
6. Check Supabase's Security Advisors after applying the SQL. The migration's RLS and grants have been exercised against a local PostgreSQL engine, but that does not establish the hosted project's complete configuration.

These SQL scripts are one-time migrations; do not rerun a script that has already been applied. If using the Supabase CLI later, link the correct project and align migration history before applying further migrations.

## Deploy on Vercel

The repository is configured for Vercel's standard Next.js build; no custom output mode or deployment command is needed. Import the Git repository as a Next.js project and keep the defaults:

- Framework preset: **Next.js**
- Build command: `npm run build`
- Install command: `npm install` (uses the committed `package-lock.json`)
- Node.js: **24.x** (the version used for verification)

Add these environment variables to the Vercel project's **Development**, **Preview** and **Production** environments as appropriate:

| Variable                               | Value                                                               |
| -------------------------------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | The Supabase project URL                                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key (legacy `anon` key is also supported) |

These are public client configuration values, not secrets. Do not configure a service-role key for this application or commit `.env.local`. `NEXT_PUBLIC_` values are included in the browser bundle, so they must never contain a private key.

Before relying on cloud accounts in the deployed app:

1. Apply the migration and complete the Supabase Auth setup in [Finish the Supabase setup](#finish-the-supabase-setup). No remote migration has been applied yet.
2. Set Supabase Auth **Site URL** to the production HTTPS origin.
3. Add `https://your-production-domain/auth/callback` and `https://your-production-domain/auth/callback?recovery=1` to Supabase's allowed redirect URLs. Add the exact Vercel preview callback URLs you intend to use as well.
4. Set the two Vercel environment variables for the target environment and redeploy after changing them.
5. Verify signup/confirmation, sign-in, password recovery, save/reload and workspace isolation using two separate test accounts before inviting real users.

Local mode does not require the database migration, but shared-link storage and cloud sign-in/persistence do. The Vercel deployment itself does not apply Supabase migrations.

## Data design and boundaries

- Next.js App Router, TypeScript, React, Supabase SSR clients, Zod validation, Decimal.js calculations, jsPDF and AutoTable.
- The database stores a JSONB business aggregate per authenticated owner or per shared-link token. This is a deliberate small-workspace design: related changes save atomically and exports use the same validated format. It is not a high-volume accounting database.
- `owner_id` is a primary key and foreign key to Auth users. All access uses the authenticated user's session. RLS restricts SELECT/INSERT/UPDATE to that owner. Anonymous access and TRUNCATE privileges are explicitly revoked.
- `itz_save_workspace` is security-invoker, uses an empty search path and compares the expected version before updating. The shared-link RPCs use narrowly scoped security-definer functions with an empty search path because the anonymous link mode has no user identity; direct table access is revoked and each RPC requires a SHA-256 token hash. No service-role key is used.
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

The browser suite starts the production server if one is not already running. After changing source, rebuild before running it. PostgreSQL tests use PGlite to run the actual migrations and exercise owner isolation, blocked direct table access and stale-version handling. They do not connect to the hosted database.

Screenshots and downloaded test PDFs are written under ignored `test-results/`. The complete verification results and known limits are recorded in [VERIFICATION.md](VERIFICATION.md).

## Private client document links

In **cloud mode**, open an issued invoice or quotation and choose **Client link**. The first click creates one private URL and opens the client page; subsequent clicks open its management dialog. Local, sample, shared-workspace and draft documents cannot publish links. The dialog includes copy/open, WhatsApp, an email draft, expiry, view statistics, regeneration, revocation, receipts synchronisation, comments and gallery management. Email/WhatsApp actions only open drafts; this app does not send messages.

Apply these one-time migrations **in this order** in the hosted SQL Editor:

1. `supabase/migrations/20261101160933_itz_business_workspace.sql`
2. `supabase/migrations/20261103100000_itz_shared_link_workspaces.sql`
3. `supabase/migrations/20261118031149_itz_client_links.sql`

The third migration includes the private `itz-project-media` bucket and its Storage policies. Run the entire file, including the Storage section, against Supabase. Do not create a public bucket or grant anonymous table access. Before applying, check Storage Settings: the **actual global upload limit must be at least 30,000,000 bytes**, and this bucket's limit is 30,000,000 bytes. Supabase's [published Free-plan ceiling is 50 MB](https://supabase.com/docs/guides/storage/uploads/file-limits), so the bucket limit fits all published plans, but the hosted project's configured global limit has **not** been checked. Authenticated upload/delete paths begin with the owner's ID and gallery ID, followed by a random UUID. The insert policy requires a matching reservation; files are not overwritten in place.

Photos accept up to 15 MB of raw input and are resized locally to JPEG, maximum 1600 px long edge, quality 0.82. Undecodable photos show an export-as-JPEG error. Videos accept MP4, WebM and MOV up to 30 MB and 90 seconds; the browser must decode them to capture a JPEG poster. There is no transcoding. Galleries hold at most 40 photos, 6 videos and 150 MB **including posters and incomplete reservations**. Limits are checked in the browser and in serialised database capacity checks; the bucket enforces MIME types and per-object size. Delete incomplete entries to release a failed upload's reservation. Deletion and caption/order changes affect every document attached to that gallery. The first ordered media item is the gallery hero; use Move up to select it.

Links are bearer credentials: anyone with a URL can read its document and comment without an account. Tokens use 32 cryptographically random bytes; RPC lookups use SHA-256. The raw token is also stored in the owner-only link row so staff can copy it later. **Trade-off:** anyone who compromises the owner's database/session access can recover these URLs. Anonymous users cannot read that table. Regenerate invalidates the old token; revoke/expire blocks future requests. View counts are approximate, limited to one increment per link per ten minutes, not unique visitors.

Public pages return a single live document without audit history, with only a revised date. Deleted/draft/missing/revoked/expired links use the same unavailable page. Void documents retain a VOID notice and have no download/print actions or gallery access. Receipt snapshots are created on link generation and after successful cloud saves, never on public views. Numbers increase without reuse; corrections/removals supersede the old receipt, preserving it with a note. Later document/company edits do not change existing receipts. A failed receipt sync is non-fatal to the workspace save and displays a warning; use **Retry receipt sync** before sharing. Receipts follow payment array order when calculating balance-after using Decimal helpers.

Storage stays private. The public page delivers media through a **same-origin streaming endpoint**, which checks the token again and uses the anon key to create a 60-second signed URL server-side. The Storage SELECT helper additionally requires the matching token hash in `x-client-link-hash`. No service-role key, public bucket fallback, analytics or third-party browser requests are used on `/c/`. This differs from exposing signed URLs directly: it prevents third-party browser requests and permits link checks on each media request. Already downloaded files cannot be recalled, and an already-issued Storage signed URL remains valid until expiry. Staff preview URLs expire after one hour. Hosting access logs must redact `/c/*` and `/api/client-*/` bearer paths; application code never logs tokens.

**Links, receipt snapshots, comments, galleries and uploaded media are outside workspace JSON backups.** Restoring a workspace does not restore or remove those records. A removed document makes its link unavailable; restoring the same document ID can make its existing, unrevoked link available again. Revoke unwanted links before replacing a workspace. Back up these database tables and Storage separately if retention is required. There are no email notifications: badges show owner-only unread counts, refreshed on cloud connection, saves and link actions.

For browser fixtures, Playwright starts the local production server with runtime `ITZ_CLIENT_FIXTURES=1`; `/c/fixture` otherwise returns 404. It is also blocked when `VERCEL` is set or `ITZ_DEPLOYMENT=production`. **Never set `ITZ_CLIENT_FIXTURES` on a hosted/public deployment.** Set `ITZ_DEPLOYMENT=production` on non-Vercel production hosts. Stop any existing localhost server before `npm run test:e2e`, so Playwright starts the fixture-enabled server. Fixture illustrations and sample documents are test-only and are never published to Supabase.

Hosted acceptance still required: use two owner accounts to verify isolation, receipt correction/backfill, cross-device comments/unread badges, upload limits, image resizing/video posters, attach a gallery to two documents, and remove it again. Check anonymous direct Storage/table access, signing without a hash and with another link's hash, and media fetches after revocation, expiry, regeneration, voiding and document deletion. Verify video range requests, especially MOV playback in each supported browser. Run Supabase Security Advisors after setup. No hosted persistence, Storage access or email delivery is claimed by the local test results.

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
