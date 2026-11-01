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
