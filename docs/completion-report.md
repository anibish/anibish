# ANIBISH launch completion report

16 November 2026, Asia/Kolkata. Application version **0.2.0**.

The public website is live at **https://anibish.com**. This is a verified public launch, not a claim that the entire master brief is complete. Customer and administrative production workspaces remain gated while owner enrollment and provider-dependent checks are outstanding. Real-money payments remain disabled.

## GitHub and deployed release

- Repository: https://github.com/anibish/anibish
- Branch: `main`; ordinary push, no force-push and no GitHub Actions.
- Deployed application commit: `27b22bcb9d61b6fc3f2ded2046ea7708ed46e239`. Push and remote branch SHA matched when published. Later documentation/test-only commits may follow this runtime release.
- Existing local implementation history was retained after removing private screenshot paths from intended public history. A private pre-publication history bundle remains owner-controlled.
- Current source/history checks found zero private storage, raw review, capture, environment-secret or database archive paths in the public history. Pattern-based secret scanning found no matches; this is not a formal secret-scanner certification.
- Fresh production dependency audit: **zero known vulnerabilities**. Development dependencies are outside that production-only result.

## Production resources

- Website: https://anibish.com
- API readiness: https://anibish.com/api/health
- Worker readiness: https://anibish.com/api/health/worker
- Customer portal: https://anibish.com/dashboard — intentionally closed.
- Super Admin: https://anibish.com/admin — intentionally closed pending owner production gate.
- No separate API hostname was necessary.
- Coolify project ANIBISH: `op7ci4izgnxwsd3x59tkun3i`; production environment `8qamsv7n1x7hcn2au4yc6iad`.
- Application: `xz0yo1hnzb8pe6nwuhvfe5tl`.
- Verified release deployment: `798a7849-2869-4bb2-a200-5a425cc1deb2`, status `finished`, source commit matches above.
- Running release container suffix: `20261115T200503`.
- Dedicated web, API, worker, PostgreSQL and Redis containers healthy; one-shot migration container exited 0. All ten migrations recorded.
- Database, Redis and API have no host-published ports. Unique volumes and private data network are isolated from other applications. Dedicated independently generated secrets are encrypted by Coolify. Review originals are mounted read-only only into this API.
- All production data is real editorial content or clearly labelled synthetic enquiry tests: 26 services, six approved anonymized reviews, 74 private evidence metadata records, eight enquiry tests, zero orders and zero payments at verification. No development accounts were imported.
- The controlled API restart passed health recovery and all four enquiries from the final browser run remained present. Previous enquiries and editorial content also survived full container replacement.

## DNS, TLS and canonical routing

Authoritative DNS is Hostinger DNS, nameservers `ns1.dns-parking.com` and `ns2.dns-parking.com`. The zone was exported before and after changes.

Only the apex A record changed: `2.57.91.91`, TTL 50 → **`160.250.205.43`, TTL 300**. The SOA serial changed automatically. Existing www CNAME to anibish.com stayed unchanged. No unnecessary API record was created.

Zone comparison confirmed preservation of MX, SPF, DKIM, DMARC, verification records, status.anibish.com, Coolify and other application records. Both authoritative lookup and public resolvers 1.1.1.1 / 8.8.8.8 resolve the new apex; www resolves via its existing CNAME.

- Canonical HTTPS homepage returns **200** with valid certificate verification.
- `https://www.anibish.com/services?source=canonical-test` returns **301** to the identical path/query on `https://anibish.com`.
- HTTP redirects to HTTPS.
- Let's Encrypt issuer YR2; apex certificate valid through **13 February 2027**. www HTTPS was also independently verified.
- Production CSP, HSTS, frame restrictions, nosniff, referrer and permissions policies are present. Session cookies are secure in production tests. No CORS wildcard was introduced; browser API calls remain same-origin.
- Canonical metadata, robots and sitemap were fetched successfully. Private workspaces and API are excluded from crawling. Sitemap supports published CMS content and settings.

## Functional modules

| Module | Evidence and production availability |
|---|---|
| Public website / services | Live and responsive. 26 services; quotation-led packages, no actual published placeholder offers. |
| About / achievements | Supplied professional facts; no profile PDF found. Unverified awards, dates and customer metrics are not invented. |
| Portfolio / reviews | Public showcase concepts are labelled; six approved authentic anonymized excerpts. Original customer image galleries are private and not represented as public deliverable screenshots. |
| Contact / lead capture | Contact, service-specific quotation and consultation forms submit, validate and persist in production. Browser confirmation is shown; email availability is disclosed. Admin inbox implementation exists but production admin access awaits its gate. |
| CMS | Persistent drafts, previews, published snapshots, archives, revisions, media rights, SEO, redirects and content propagation tested locally. Some content types use structured fields instead of specialized editors. |
| CRM / quotes / orders | Database-backed quotation, acceptance, contracts and order/project creation verified locally; gated in production. |
| Projects / milestones | Kanban, subtasks, dependencies, team assignment, weighted milestone progress, templates, private time and history implemented. Complex resource scheduling is partial. |
| Messaging | Customer/admin threads, search, near-real-time polling, reconnection, attachments, read state, internal notes and customer isolation tested locally; gated in production. |
| Delivery / acceptance | Versioned files, approval/revision decisions and final handover guards tested locally; gated in production. |
| Billing | Itemized draft editing, sequential immutable finalization, PDF/history, partial allocation, dates, due/overdue, deposits, credit notes, refunds, manual verification and currency-separated reports tested in sandbox. Not legal tax invoices. |
| Recurring agreements | Month-end billing anchors, idempotent recurring draft creation, renewal notices and customer cancellation requests tested locally. No automatic real charges. |
| Notifications | Database outbox, Redis hints, worker, retries, stable IDs, preferences, logs and configurable published templates. Worker is running; **actual email delivery is unavailable** without dedicated verified SMTP. |
| Support / operations | Persisted support threads, internal replies, first-response timing, real-record business/CRM/project reports, CSV export, audit and permissions tested locally. Gated in production. |
| Administration | Connected UI and permissions tested with QA MFA identities. Actual production owner enrollment/sign-in remains outstanding; do not treat this as passed. |

The status vocabulary and practical limits are maintained in `feature-coverage.md`.

## Security, review privacy and recovery

Password hashing, CSRF rejection, persistent login lockout, session revocation, multi-customer isolation, role escalation denial, file ownership, internal attachment privacy, file magic validation and sandbox callback signatures/replay prevention have executed tests. Privileged routes are closed in the current public release. No development/debug authentication bypass is exposed.

All 74 screenshot hashes were reviewed against the preserved inventory. Photos/logos and missing republication permission prevent public image publication. The owner approved exactly six anonymized text excerpts, including the original individual 4.7/5 rating where applicable; no aggregate rating is claimed. Originals, derivatives and historical captures are excluded from public history. Authorized private evidence delivery verifies the original hash.

Recent own-container logs were compared against configured secret values, with zero matches reported and no secret values printed. This is a targeted check, not proof against every possible sensitive log payload.

Daily encrypted backup runs at 02:15 UTC. Fresh archive `anibish-20261115T201130Z.tar.gpg` passed checksum, decryption and restore into a disposable isolated database: 26 services, 11 CMS records, eight enquiries, zero orders/payments, all 74 private originals. The API restart preserved all four final browser enquiry references.

The owner explicitly approved private local copies of the backup recovery key and this encrypted archive. They were stored in ignored `.local/launch/`, restrictive owner-only permissions; archive checksum matched the VPS. Recovery secrets are not in source or logs. The separate MFA encryption key and Coolify configuration still need a complete independent owner recovery plan. Daily offsite automation, retention policy, full replacement-VPS recovery and MFA recovery codes remain outstanding. Database restore alone does not recover lost MFA encryption keys.

## Monitoring and existing applications

Uptime Kuma ANIBISH group **55** contains Website & TLS **56**, API readiness **57** and Worker readiness **58**, with 60-second checks and TLS validation enabled. Database and Redis have private Docker health checks; API readiness also exercises the database and checks Redis. No database, Redis or Docker management port was exposed for monitoring.

Deployment cutover and the deliberate restart produced recorded temporary downtime; no monitoring history was cleared. There is no claim of zero-downtime deployment. A dedicated ANIBISH alert destination is not configured; unrelated 10LEARN/Estiva channels were not repurposed.

Existing CarsWhere, Estiva, Bishnoi, GadgetsWhere and Origin application checks were observed healthy during final monitoring review. Existing 10LEARN failures and infrastructure load/swap warnings predated this launch and were not “fixed” by changing other projects. No unrelated application restart, routing change, Docker cleanup or volume deletion was performed. The VPS retains approximately 30 GB free disk; available memory was around 5.6 GB, with substantial existing swap usage.

## Executed verification

| Check | Result |
|---|---|
| Optimized Next.js build | PASS |
| Frontend / API TypeScript | PASS / PASS |
| ESLint | PASS |
| API/security test groups | **25/25 PASS**, isolated QA database |
| Continuation browser workflow groups | **12/12 PASS**, distinct QA customers and MFA admin |
| Operations mobile layouts | Five views checked without horizontal overflow |
| Final public browser assertions | **37 PASS**, desktop 1440×1000 / mobile 390×844 |
| Additional production checks | **16 PASS**: HTTPS, redirects, gates, validation, sandbox, health, evidence denial |
| Browser page errors | Zero in final public and operations runs |
| Sandbox invoice PDF | Downloaded, rendered and visually inspected |
| Public contact / quote / consultation | Four final synthetic submissions; verified in database after API restart |
| Encrypted restore | PASS, isolated database and 74 original files |
| Production dependency vulnerabilities | Zero known, omit-dev audit |
| Actual production customer login / isolation | NOT ENABLED / NOT EXECUTED with production customers |
| Actual production admin MFA login / service edit | BLOCKED pending private owner enrollment |
| Live SMTP / live payments | NOT CONFIGURED / DELIBERATELY DISABLED |

A first smoke attempt during container cutover received 503; the final run started after readiness and passed. A private-resource assertion was adjusted to verify non-image not-found content because streamed Next.js not-found responses can carry HTTP 200. No private image bytes were returned; strict unknown-route HTTP status remains a limitation.

Private screenshot gallery: `.local/launch/index.html` (32 final public images plus 13 operations/PDF images). Historical design captures: `.local/visual-audit/screenshots/index.html` (the earlier 250-capture audit, not a new production result). Route inventory: `docs/route-inventory.md`. Raw test JSON stays private under `.local/launch/`.

## Remaining owner/provider work

1. Complete private production owner password/authenticator enrollment using `.local/launch/enroll-owner.command`; then verify actual production MFA sign-in, audit and safe administration before opening Gate C. The launcher refuses replacement of an existing privileged user.
2. Supply dedicated ANIBISH SMTP credentials in private configuration; verify sender-domain authentication and actual delivery. Existing DNS records alone are not evidence that mail delivery works. Customer verification/recovery and Gate B depend on this.
3. Supply verified legal, GST/tax and banking details and approve final policies. Current invoices remain explicitly sandbox development records.
4. Live payment activation needs a real merchant/provider adapter, production credentials, verified signatures, duplicate/refund/reconciliation tests and separate explicit owner authorization. No real-money collection is enabled.
5. Decide ANIBISH alert destination, independent MFA/config recovery storage, offsite schedule and retention. Add MFA recovery, malware scanning where supported and independent security/accessibility review.
6. Complete specialized CMS editors and advanced resource scheduling where the generic structured workflows do not fulfill the full master brief.

Public lead capture remains independent of these payment and portal blockers.
