# ITZ Business Studio

A complete Next.js workspace for **ITZ Engineering / I.T.Z Metal Works Ltd**. The original company identity, contacts, blue/orange colours, UGX default and engineering measurement schedules are preserved from `ITZ_INVOICESXYZ_updated.html`. That source file remains unchanged.

## Run locally

Requires Node.js 20.9 or later (Node 24 recommended).

```powershell
npm install
npm run dev
```

Open **http://localhost:3000**. Dependencies are already installed in this workspace. `.env.local` contains the Supabase URL, publishable key and the two administrator email/role mappings; it is excluded from version control. On another computer, copy `.env.example` to `.env.local` and enter the Supabase publishable key. Never put passwords, password hashes, a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable.

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

## One shared cloud workspace

Supabase is the only workspace backend. Both authorised administrators open the same company records on every device. Local, sample and separate link-based workspace modes have been removed. Loading failures block editing with a retry action; failed saves retain the form and never save business records to browser storage. Version checks reject stale concurrent writes. Reopen or refresh the cloud workspace to see another device's latest changes.

Existing browser records are preserved. On each old device, sign in and choose **Settings ? Import legacy device records** to merge them into the cloud explicitly. Conflicting IDs, document numbers or company settings stop the merge without changing either source. There is no automatic import or new local saving. Keep old backups until import is verified. Legacy separate workspace copies remain in the database for administrator recovery, but their APIs and RPC permissions are retired. Document-specific client links remain available.

## Administrator access

The app accepts only the email addresses configured by `BUSINESS_ADMIN_EMAIL` and `TECH_ADMIN_EMAIL`. Public account creation is disabled in the app, and server APIs verify the signed-in Supabase user against this allowlist. Both admins use the same company workspace; the technical admin additionally gets an **Infrastructure** page with sanitized Vercel deployment metadata and a live Supabase workspace-table check. Credentials and business APIs require an authorized session.

Create or invite each user from the Supabase Dashboard's Authentication user management, using the supplied email addresses. Supabase Auth stores password hashes. After both users exist and the migrations are applied, run `npm run setup:shared-admins` locally with a temporary `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`; the script assigns both accounts the business admin's shared-workspace owner claim. The service-role key is only for this one-time setup: never add it to Vercel or commit it. Sign out and back in on each device to refresh the admin sessions.

## Finish the Supabase setup

The app uses project `rmmwkuihqmezwdugttsr`. On 18 November 2026 its Auth endpoint responded and both configured admins had the same shared-owner metadata. The workspace Data API returned HTTP 404 / PGRST205 (table absent from the schema cache); the shared-workspace and client-link tables also returned 404. The available CLI account received HTTP 403 for database queries. **Hosted migration state and live database persistence remain unverified.** The app itself uses only the publishable key; the one-time shared-admin setup script requires a temporary service-role key.

1. Open the SQL Editor for the supplied Supabase project.
2. Run, once each and in this order, the complete contents of [`supabase/migrations/20261101160933_itz_business_workspace.sql`](supabase/migrations/20261101160933_itz_business_workspace.sql), [`supabase/migrations/20261103100000_itz_shared_link_workspaces.sql`](supabase/migrations/20261103100000_itz_shared_link_workspaces.sql), [`supabase/migrations/20261118031149_itz_client_links.sql`](supabase/migrations/20261118031149_itz_client_links.sql), [`supabase/migrations/20261118035044_itz_client_isolation.sql`](supabase/migrations/20261118035044_itz_client_isolation.sql), [`supabase/migrations/20261118071120_itz_shared_workspace_owner_isolation.sql`](supabase/migrations/20261118071120_itz_shared_workspace_owner_isolation.sql), and [`supabase/migrations/20261118091714_itz_cloud_only.sql`](supabase/migrations/20261118091714_itz_cloud_only.sql). The workspace migration enables the shared owner claim for both admins; the later migrations keep links, comments, galleries, receipts and media under that same owner. The storage migration creates a private bucket. These scripts do not touch unrelated business tables.
3. Enable email/password sign-in and disable public sign-ups. Create or invite both configured admins. Configure SMTP for invitations and password resets.
4. With the temporary service-role key available locally, run `npm run setup:shared-admins`. Remove the key from `.env.local` afterward, then sign out and back in for both accounts.
5. Set `BUSINESS_ADMIN_EMAIL` and `TECH_ADMIN_EMAIL` in the Vercel Production environment (and Preview/Development if used), then redeploy. Set the Supabase Auth Site URL and callback URLs for local and deployed origins.
6. Open the app once on each device and sign in. The device's local records are merged into the shared cloud workspace. Check the visible sync notice; resolve any reported conflicts and keep the local backup until successful.
7. Check Supabase's Security Advisors after applying the SQL. Local migration tests do not establish the hosted project's complete configuration.

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
| `BUSINESS_ADMIN_EMAIL`                 | `mulumbakacm@gmail.com`                                             |
| `BUSINESS_ADMIN_NAME`                  | `Mulumba Kasim E`                                                   |
| `TECH_ADMIN_EMAIL`                     | `shabehamba@gmail.com`                                              |
| `TECH_ADMIN_NAME`                      | `Hamba Shabil E`                                                    |

The Supabase URL and publishable key are public client configuration values; the allowlist and display names are server-side configuration. The application runtime must not have a service-role key. Use one only for the local bootstrap script, then remove it from `.env.local`; never commit `.env.local`. `NEXT_PUBLIC_` values are included in the browser bundle, so they must never contain a private key. Do not deploy password or password-hash variables.

Before relying on cloud accounts in the deployed app:

1. Apply the migration and complete the Supabase Auth setup in [Finish the Supabase setup](#finish-the-supabase-setup). Remote migration state has not been verified.
2. Set Supabase Auth **Site URL** to the production HTTPS origin.
3. Add `https://your-production-domain/auth/callback` and `https://your-production-domain/auth/callback?recovery=1` to Supabase's allowed redirect URLs. Add the exact Vercel preview callback URLs you intend to use as well.
4. Set all six environment variables above in Vercel's **Development**, **Preview** and **Production** environments as appropriate, then redeploy.
5. Confirm both admin users have the shared-workspace app metadata by running `npm run setup:shared-admins` locally, then sign in on two devices and verify local import, shared save/reload and access by both admins. Verify that the business admin receives 403 from `/api/admin/infrastructure` and that the technical admin can view deployment metadata and database health.

Cloud access requires all six migrations. Vercel deployment does not apply them. Browser-local data cannot be read remotely; use the explicit legacy import action on each old device after cloud setup.

## Data design and boundaries

- Next.js App Router, TypeScript, React, Supabase SSR clients, Zod validation, Decimal.js calculations, jsPDF and AutoTable.
- The database stores a JSONB business aggregate under the shared owner assigned to both administrators. This is a deliberate small-workspace design: related changes save atomically and exports use the same validated format. It is not a high-volume accounting database.
- `owner_id` is a primary key and foreign key to Auth users. All access uses the authenticated user's session. RLS restricts SELECT/INSERT/UPDATE to that owner. Anonymous access and TRUNCATE privileges are explicitly revoked.
- `itz_save_workspace` is security-invoker, uses an empty search path and compares the expected version before updating. The retired workspace-copy RPCs have no application-role execution grants. Missing shared-owner claims fail closed instead of creating a personal workspace. No service-role key is used.
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

**Client isolation hardening:** after the three migrations below, apply `supabase/migrations/20261118035044_itz_client_isolation.sql`. This fourth migration permanently retires pre-existing client links and galleries because they have no proven recipient binding. It preserves their owner-only records. Create a fresh document/link and gallery to share again; legacy links cannot be regenerated.

New links are bound to the document's complete client snapshot. A change to client details, deletion of the document or workspace, or moving the document back to draft permanently retires its link. Restoring the old document does not reactivate it. Ordinary document/item/payment edits remain live. Galleries may be attached to multiple documents **only for the same client ID**; the picker and database reject cross-client reuse. Internal RPCs are not anonymously callable, and public data uses nested field allowlists.

These remain private **bearer links**, not verified client identities: anyone possessing a valid URL (including someone it is forwarded to) can read that document. Only share the URL with the intended recipient and put client-appropriate content in that document/gallery. Requiring proof of identity would require changing the agreed no-login design. Already downloaded information cannot be recalled; already-issued Storage URLs remain valid until expiry.

In **cloud mode**, open an issued invoice or quotation and choose **Client link**. The first click creates one private URL and opens the client page; subsequent clicks open its management dialog. Draft documents cannot publish links. The dialog includes copy/open, WhatsApp, an email draft, expiry, view statistics, regeneration, revocation, receipts synchronisation, comments and gallery management. Email/WhatsApp actions only open drafts; this app does not send messages.

Apply all six migrations in filename order as listed in **Finish the Supabase setup**. The initial client-link dependencies are:

1. `supabase/migrations/20261101160933_itz_business_workspace.sql`
2. `supabase/migrations/20261103100000_itz_shared_link_workspaces.sql`
3. `supabase/migrations/20261118031149_itz_client_links.sql`

The third migration includes the private `itz-project-media` bucket and its Storage policies. Run the entire file, including the Storage section, against Supabase. Do not create a public bucket or grant anonymous table access. Before applying, check Storage Settings: the **actual global upload limit must be at least 30,000,000 bytes**, and this bucket's limit is 30,000,000 bytes. Supabase's [published Free-plan ceiling is 50 MB](https://supabase.com/docs/guides/storage/uploads/file-limits), so the bucket limit fits all published plans, but the hosted project's configured global limit has **not** been checked. Authenticated upload/delete paths begin with the owner's ID and gallery ID, followed by a random UUID. The insert policy requires a matching reservation; files are not overwritten in place.

Photos accept up to 15 MB of raw input and are resized locally to JPEG, maximum 1600 px long edge, quality 0.82. Undecodable photos show an export-as-JPEG error. Videos accept MP4, WebM and MOV up to 30 MB and 90 seconds; the browser must decode them to capture a JPEG poster. There is no transcoding. Galleries hold at most 40 photos, 6 videos and 150 MB **including posters and incomplete reservations**. Limits are checked in the browser and in serialised database capacity checks; the bucket enforces MIME types and per-object size. Delete incomplete entries to release a failed upload's reservation. Deletion and caption/order changes affect every document attached to that gallery. The first ordered media item is the gallery hero; use Move up to select it.

Links are bearer credentials: anyone with a URL can read its document and comment without an account. Tokens use 32 cryptographically random bytes; RPC lookups use SHA-256. The raw token is also stored in the owner-only link row so staff can copy it later. **Trade-off:** anyone who compromises the owner's database/session access can recover these URLs. Anonymous users cannot read that table. Regenerate invalidates the old token; revoke/expire blocks future requests. View counts are approximate, limited to one increment per link per ten minutes, not unique visitors.

Public pages return a single live document without audit history, with only a revised date. Deleted/draft/missing/revoked/expired links use the same unavailable page. Void documents retain a VOID notice and have no download/print actions or gallery access. Receipt snapshots are created on link generation and after successful cloud saves, never on public views. Numbers increase without reuse; corrections/removals supersede the old receipt, preserving it with a note. Later document/company edits do not change existing receipts. A failed receipt sync is non-fatal to the workspace save and displays a warning; use **Retry receipt sync** before sharing. Receipts follow payment array order when calculating balance-after using Decimal helpers.

Storage stays private. The public page delivers media through a **same-origin streaming endpoint**, which checks the token again and uses the anon key to create a 60-second signed URL server-side. The Storage SELECT helper additionally requires the matching token hash in `x-client-link-hash`. No service-role key, public bucket fallback, analytics or third-party browser requests are used on `/c/`. This differs from exposing signed URLs directly: it prevents third-party browser requests and permits link checks on each media request. Already downloaded files cannot be recalled, and an already-issued Storage signed URL remains valid until expiry. Staff preview URLs expire after one hour. Hosting access logs must redact `/c/*` and `/api/client-*/` bearer paths; application code never logs tokens.

**Links, receipt snapshots, comments, galleries and uploaded media are outside workspace JSON backups.** Restoring a workspace does not restore or remove those records. A removed document permanently retires its link after the isolation migration; restoring the same document ID does not revive it. Revoke unwanted links before replacing a workspace. Back up these database tables and Storage separately if retention is required. There are no email notifications: badges show owner-only unread counts, refreshed on cloud connection, saves and link actions.

For browser fixtures, Playwright starts the local production server with runtime `ITZ_CLIENT_FIXTURES=1`; `/c/fixture` otherwise returns 404. It is also blocked when `VERCEL` is set or `ITZ_DEPLOYMENT=production`. **Never set `ITZ_CLIENT_FIXTURES` on a hosted/public deployment.** Set `ITZ_DEPLOYMENT=production` on non-Vercel production hosts. Stop any existing localhost server before `npm run test:e2e`, so Playwright starts the fixture-enabled server. Fixture illustrations and sample documents are test-only and are never published to Supabase.

Hosted acceptance still required: apply all six migrations, then use both admin accounts to verify shared access and an unauthorised account to verify isolation, receipt correction/backfill, cross-device comments/unread badges, upload limits, image resizing/video posters, attach a gallery to two documents, and remove it again. Check anonymous direct Storage/table access, signing without a hash and with another link's hash, and media fetches after revocation, expiry, regeneration, voiding and document deletion. Verify video range requests, especially MOV playback in each supported browser. Run Supabase Security Advisors after setup. No hosted persistence, Storage access or email delivery is claimed by the local test results.

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
