# Design and functional verification

Verified locally on 15 November 2026 using Node 22.23.3, Next.js 16.4.6, PostgreSQL 16 and headless Google Chrome. This report does not certify production readiness.

| Check | Result | Evidence / limits |
|---|---|---|
| Optimized Next.js build | PASS | 85 application path entries generated; standalone output prepared |
| Frontend TypeScript | PASS | `npm run typecheck` |
| API TypeScript | PASS | `npm run typecheck:api` |
| ESLint | PASS | `npm run lint` (quiet mode) |
| API/security integration groups | PASS · 8/8 | Separate `anibish_qa` database; `api-verification.json` and test source |
| Browser customer journey | PASS · 9 steps | `browser-journey.json`; actual UI quote creation, acceptance, sandbox payment, delivery, approval, invoice, messaging, upload and support |
| Desktop/mobile route and module audit | PASS | 250 captures: 242 screen captures plus eight editor/detail captures; `browser-verification.json` |
| Browser page errors | PASS | Zero detected in audited pages |
| Broken image checks | PASS | Zero detected in audited pages |
| Horizontal overflow | PASS | Zero detected at 1440 × 1000 and 390 × 844; tables scroll within their container |
| Light/dark appearance | PASS for representative views | Four additional dark-theme captures; all public screens and client/admin modules use shared tokens |
| Public discovery and contact | PASS | Service filtering/empty state, contact persistence, dialog Escape and mobile navigation |
| Source import | PASS | 74 source screenshots, repeat import without duplicate records, full per-source report |
| Sandbox invoice | PASS | Authenticated PDF download, `%PDF` validation, rendered and visually inspected; explicitly not a tax invoice |
| Production dependency audit | PASS | Zero known vulnerabilities reported by `npm audit --omit=dev`; `dependency-audit.json` |
| Compose syntax | PASS | `docker compose config --quiet` using syntax-only dummy secrets |
| Docker image/runtime | UNVERIFIED | Configuration prepared; containers not built or deployed |
| Production payment/email | BLOCKED | Sandbox adapter and local outbox only |
| Full accessibility / Safari / Firefox | UNVERIFIED | Keyboard focus and reduced motion implemented; no formal WCAG or multi-engine certification |

## Defects found and corrected

- Form selects used implicit wrapping labels whose text included option content. Fields now have explicit, unique label/control associations.
- Absolutely positioned hidden table headings extended the mobile document width. Table headings and scroll wrappers now establish a containing block.
- The initial capture run exceeded API limits and reached private gates instead of administrative screens. The final run used a development-only higher limit and required authenticated workspace markup before capture. Production defaults remain rate-limited.
- Development hot reload interrupted an early screenshot run. Final captures use the standalone production build served only on local loopback.

## Incomplete screens and functional limits

Every requested primary public page and the original client/admin screen set has a navigable layout. Advanced modules such as campaigns, timesheets, retainers, expenses, maintenance and credit notes currently provide persistent supporting records rather than complete specialized business workflows. Their screens are explicitly partial in `feature-coverage.md`.

The service editor, quote detail, order detail and message thread have extra desktop/mobile captures. Some advanced forms extend within scrollable dialogs. Public images representing products are clearly labelled interface concepts; source evidence is linked separately.

The public editorial service collection remains bundled content. The connected service catalogue reads the database; full public CMS propagation and comprehensive SEO rendering are partial. Policy drafts, owner-supplied award details and unapproved prices are not treated as verified commercial publication.

## Reproduce

Run the API and standalone web application against isolated development services, prepare `db:seed:local`, then run `npm run test:browser` and `npm run verify`. The latter performs a full screenshot pass; `node scripts/capture-details.mjs` adds editor/detail views. Use only development data. The automated capture pass needs an appropriately high **development-only** API request limit.
