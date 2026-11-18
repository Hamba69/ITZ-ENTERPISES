# Verification record

Verified on **1 November 2026** in `D:\PROBOOK\ITZ` with Node.js 24.13.0.

## Passed

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed; subsequent production builds also completed TypeScript checking |
| `npm run build` | Passed with Next.js 16.4.3; the home page, workspace API, auth callback and session proxy compiled |
| `npm test` | 8 tests passed |
| Main Playwright browser suite | 7 tests passed |
| Four-template print/export browser suite | 4 tests passed after the print-spacing correction |
| Local storage reload | Saved client, invoice details, measurements and design persisted |
| Local multi-tab conflict | A stale tab could not overwrite newer saved records; its form stayed open |
| Invoice arithmetic | Decimal multiplication, discount-before-tax, currency rounding, balances and overpayment rejection checked |
| Invoice lifecycle | Draft creation, editing, issue, partial/full payment, derived status and report totals checked |
| Quotation workflow | Conversion produced a new invoice number and retained the source quotation |
| Business records | Client, item-library and expense creation exercised in Chromium |
| Backup handling | JSON download worked; an invalid restore was rejected without changing records |
| Sample mode | Entering/exiting samples preserved real local records |
| Mobile layout | 390 px viewport, navigation, template selection, preview and Escape dismissal checked; no page-level horizontal overflow |
| API without authentication | GET returned 401; a write without a valid origin returned 403 |
| PostgreSQL owner isolation | Actual migration exercised in PGlite with two user identities and simulated Supabase default table grants |
| PostgreSQL privileges | Anonymous reads/writes, owner reassignment and authenticated TRUNCATE rejected |
| PostgreSQL concurrency | Stale expected versions rejected; valid updates advanced the version |
| PDF export | Downloaded real PDF files; extracted text and visually inspected rendered pages |
| Long PDF | 65 invoice items and a 40-row measurement schedule exported over six pages; final item, W40 and end-of-document marker present |
| Print templates | Industrial, Forge, Editorial and Blueprint sample documents each fit on one A4 page, including payment history and closing terms |

The browser checks used the production build and Chromium headless. Test screenshots, PDFs and traces are under the ignored `test-results/` directory. Production test servers were stopped after the checks.

## Hosted Supabase boundary

- The supplied project's Auth settings endpoint responded with HTTP 200.
- The `itz_workspaces` Data API request returned HTTP 404: the required workspace resource was not available through that API.
- The authenticated local CLI account did not list the supplied project among its accessible projects.
- No migration was applied to the remote project and no existing remote tables were modified.
- Hosted signup/confirmation/reset email delivery, authenticated persistence and deployed RLS have **not** been verified. Local PostgreSQL policy tests do not prove the hosted configuration.
- Follow the Supabase setup section in `README.md`, then perform the documented two-account hosted acceptance check.

## Practical limits

This is a single-owner small-business workspace, with a 5 MB aggregate storage limit. It does not process payments, send emails automatically, provide statutory accounting or support shared team roles. PDF exports use portable standard fonts; use browser Print / Save as PDF for the exact screen layout and browser-supported characters outside those fonts. Automated tests used Chromium, not Safari or Firefox.

The original HTML concept remains in place. No application ZIP was packaged or deployed.

## Client links — 18 November 2026

Implemented on branch `client-links`; no push, deployment or hosted migration was performed.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 16 passed, none skipped |
| `npm run build` | Passed on Next.js 16.4.6 |
| `npm run test:e2e` | 20 passed, none skipped, including the four existing print-template tests |
| `npm audit` after patch update | Zero vulnerabilities reported |
| Client layout | Chromium at 390 px: no horizontal overflow; full-page screenshot inspected |
| Document and receipt PDFs | Both downloaded with PDF signatures; existing long-document and four-template export tests remain passing |
| Comments | Browser validation, server origin/size/honeypot rejection; PGlite length constraints, 10/hour and 200/link limits |
| Public isolation | Actual new migration in PGlite: no anonymous SELECT/INSERT/UPDATE/DELETE on new tables; two-owner isolation; missing, invalid, revoked, expired and deleted document links unavailable |
| Sensitive data | Public RPC excludes owner ID, raw token, token hash, other workspace records, audit trail, previous version and audit actor |
| Receipts | Decimal balance/numbering; no rewrite after company edits; corrected/removed payment supersession; database preserves old snapshot and rejects stale sync versions/direct receipt writes |
| Galleries | Unit size/duration/type/count/byte validation; database count/byte reservations and owner isolation; Storage helper requires matching hash and denies revoked/expired/deleted/void links |
| Keyboard/print | Lightbox Tab focus trap, arrow navigation, Escape and focus return; print hides everything except document sheet |
| Privacy headers | Public page no-referrer, no-store; no third-party browser requests observed in fixture test |
| Fixture gate | `/c/fixture` returns HTTP 404 on a separate production server without `ITZ_CLIENT_FIXTURES` |

Evidence is in ignored `test-results/client-mobile.png`, `test-results/client-Download-PDF.pdf`, `test-results/client-Download-receipt-PDF.pdf` and the Playwright results. Fixtures are illustrations and sample documents, not hosted customer data. The owner APIs and UI use the existing allowlisted authentication helpers. Their existing source files were included unchanged as feature dependencies; unrelated pre-existing working-tree edits remain uncommitted. Checks ran against the full current working tree, including those pre-existing changes.

Decisions differing from the brief:

- Public media uses same-origin streaming with a token recheck, rather than sending Supabase signed URLs to the browser. The server uses the anon key and a token-hash-backed Storage SELECT policy; signed URLs last 60 seconds and remain server-side. This avoids third-party browser requests and makes revocation effective for subsequent proxy requests. Staff-only previews use one-hour signed URLs. No public-bucket fallback was used.
- An additional token-scoped media-path RPC is needed for streaming. It returns only a matching media object path, not workspace content; paths necessarily contain the owner/gallery folder identifiers required by the storage layout. These paths are never included in public page props or browser media URLs. Treat them as identifiers, not additional credentials.
- Upgraded Next.js from 16.4.3 to 16.4.6 after the build stopped on security advisories. `npm audit` confirmed [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h) and [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8); the patched dependency removes the build warning and audit findings.
- Receipt client snapshots retain the received-from name only, avoiding unnecessary historical client contact details in public receipts. Company details and payment facts remain frozen.

### Hosted/manual acceptance still required

Hosted Supabase persistence, deployed grants/RLS, Storage access and email delivery remain **unverified**. No remote database was changed. PGlite runs the schema/functions before the explicitly marked Storage section; it cannot execute Supabase Storage service behaviour.

1. Apply the three migrations in README order and run Security Advisors. Confirm the actual global upload limit is at least 30 MB, the bucket is private and its MIME/size limits and policies are installed.
2. With two actual owners, test link creation, no draft publishing, regeneration/expiry/revocation, cross-owner table and gallery isolation, saved live revisions, void notices and removal of download actions. Test concurrent workspace saves and receipt-sync retry after a simulated failure.
3. Add/correct/remove payments before and after link creation. Confirm receipt backfill, immutable old receipts, replacement numbering and visible superseded notes from another device.
4. Upload images and supported videos; check actual resized dimensions, poster capture, multi-file progress, captions, ordering, deletion, shared-gallery attachments, quota races, interrupted uploads and cleanup. Check HEIC decode errors. Verify 30 MB/90-second limits and 150 MB total including posters.
5. Test anonymous direct table access and object signing without a hash, with a wrong hash, with the correct hash, and **after revoking the link**. Repeat for expiry, regeneration, detached galleries, void and deleted documents. Previously issued Storage URLs can survive until expiry; previously downloaded content cannot be recalled. Check video range requests and browser-specific codecs, including MOV, on real devices.
6. Check client comments and owner unread badges/replies/hide/delete on two devices. There is no notification email or automatic message delivery. Public comment success was browser-mocked; real insertion/rate limits were tested in PGlite, not through hosted PostgREST.
7. Keep fixture flags disabled on every public deployment, set `ITZ_DEPLOYMENT=production` on non-Vercel hosts, and verify 404 remotely. Redact bearer paths from hosting/proxy access logs. Perform screen-reader and cross-browser checks; the local automated suite uses Chromium only.

### Feature files

- Migration: `supabase/migrations/20261118031149_itz_client_links.sql`.
- APIs: `src/app/api/client-links/route.ts`, `src/app/api/client-comments/[token]/route.ts`, `src/app/api/client-galleries/route.ts`, `src/app/api/client-media/[token]/[id]/route.ts`, plus the receipt hook in `src/app/api/workspace/route.ts`.
- Public/studio UI: `src/app/c/[token]/page.tsx`, `src/components/client-page-view.tsx`, `src/components/client-page.css`, `src/components/client-link-manager.tsx`, `src/components/studio.tsx`.
- Helpers: `src/lib/client-links.ts`, `src/lib/client-link-server.ts`, `src/lib/client-request.ts`, `src/lib/project-media.ts`, `src/lib/pdf.ts`; existing auth dependencies `src/lib/auth/admin.ts` and `src/lib/auth/roles.ts`.
- Tests/fixtures: `tests/client-links.test.ts`, `tests/database.test.ts`, `tests/e2e/client-links.spec.ts`, `src/lib/client-fixture.ts`, `src/app/c/fixture/page.tsx`, `playwright.config.ts`.
- Configuration/documentation: `next.config.ts`, `package.json`, `package-lock.json`, `README.md`, `VERIFICATION.md`.

`DocumentView`, the original `exportPdf` function, shared-link mode and workspace backup schema were not changed by this feature. New public CSS is scoped under `.client-page`.

## Client isolation hardening — 18 November 2026

Follow-up security review found that owner isolation alone did not prevent an existing link following a document reassigned to another client, or the owner attaching one gallery to different clients' documents. The additive `20261118035044_itz_client_isolation.sql` migration closes both paths. Apply it **after** the three earlier migrations. It permanently retires legacy links and gallery bindings rather than guessing the historical recipients; existing receipts/comments/media remain available only to their owner. A fresh document/link and gallery are required for subsequent sharing of those legacy records.

- Links bind to the complete client snapshot. Changing client details, removing the document/workspace or changing its status to draft permanently retires the link. Restoring the record does not revive it, and regeneration cannot transfer the old thread or receipts to a different recipient. Other document revisions remain live.
- Gallery bindings are immutable from owner-facing table access. The database and picker only allow attachments to documents for the same client ID, while different documents for that client may share a gallery.
- Public document and receipt projections whitelist nested fields. The unfiltered internal RPCs and helper functions have no anonymous execution grant. Document reads hold workspace/link locks in the same order as owner mutations to prevent reassignment racing the projection.
- Public page, comment and media APIs call versioned RPCs available only after the isolation migration. Missing migration means unavailable/failing requests, never fallback to the older implementation. Receipt synchronisation excludes retired links.
- Added `tests/client-isolation.test.ts`: two clients within one workspace; distinct receipts and comments; cross-client gallery rejection; guessed media ID plus wrong token/header; nested private fields; blocked internal RPCs; live ordinary revisions; reassignment/deletion/restoration; irreversible retirement; and safe legacy migration.
- Added `tests/e2e/client-isolation.spec.ts`: a public bearer token cannot act as an owner session for workspace/link/gallery APIs; invalid media tokens return 404.

Validation: `npm test` **18 passed**, `npm run typecheck` passed, `npm run build` passed, `npm run test:e2e` **21 passed**, with no skipped tests. These checks cover the current local working tree; hosted SQL/Storage policies and real-device revocation are still unverified. No push or remote migration was performed.

Boundary: this remains the explicitly requested no-login bearer-link design. The system restricts what each token can access, but cannot identify who is holding a forwarded valid URL or classify information staff deliberately put in a client's document/gallery. Already downloaded content cannot be recalled. An issued Storage URL can remain usable until its expiry. Requiring verified recipient identity would need an additional authentication/verification flow.
