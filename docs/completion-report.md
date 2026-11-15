# ANIBISH launch completion report

16 November 2026, Asia/Kolkata. Application version **0.2.0**.

The public website is live at **https://anibish.com**. This is a verified public launch, not a claim that the entire master brief is complete. MFA-protected administration is enabled after verified owner enrollment, production sign-in, audit and encrypted recovery. Customer workspaces remain closed pending provider-dependent checks. Real-money payments remain disabled.

## GitHub and deployed release

- Repository: https://github.com/anibish/anibish
- Branch: `main`; ordinary push, no force-push and no GitHub Actions.
- Deployed application commit: `8d91a3c8ebc7d855bedac22421d30c286fb7f89b`. Push and remote branch SHA matched when published. Later documentation/test-only commits may follow this runtime release.
- Existing local implementation history was retained after removing private screenshot paths from intended public history. A private pre-publication history bundle remains owner-controlled.
- Current source/history checks found zero private storage, raw review, capture, environment-secret or database archive paths in the public history. Pattern-based secret scanning found no matches; this is not a formal secret-scanner certification.
- Fresh production dependency audit: **zero known vulnerabilities**. Development dependencies are outside that production-only result.

## Production resources

- Website: https://anibish.com
- API readiness: https://anibish.com/api/health
- Worker readiness: https://anibish.com/api/health/worker
- Customer portal: https://anibish.com/dashboard — intentionally closed.
- Super Admin: https://anibish.com/admin — enabled for enrolled MFA-protected studio accounts.
- No separate API hostname was necessary.
- Coolify project ANIBISH: `op7ci4izgnxwsd3x59tkun3i`; production environment `8qamsv7n1x7hcn2au4yc6iad`.
- Application: `xz0yo1hnzb8pe6nwuhvfe5tl`.
- Verified release deployment: `4983feaf-88e2-4572-b8a6-24f471c32ecf`, status `finished`, source commit matches above.
- Running release container suffix: `20261115T204035`.
- Dedicated web, API, worker, PostgreSQL and Redis containers healthy; one-shot migration container exited 0. All ten migrations recorded.
- Database, Redis and API have no host-published ports. Unique volumes and private data network are isolated from other applications. Dedicated independently generated secrets are encrypted by Coolify. Review originals are mounted read-only only into this API.
- All production data is real editorial content or clearly labelled synthetic enquiry tests: 26 published services and one archived unpublished synthetic validation service, six approved anonymized reviews, 74 private evidence metadata records, eight enquiry tests, zero orders and zero payments at verification. One legitimate owner account was enrolled privately; no development accounts were imported.
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
| Contact / lead capture | Contact, service-specific quotation and consultation forms submit, validate and persist in production. Browser confirmation is shown; email availability is disclosed. The owner verified all eight synthetic enquiry records in the production inbox. |
| CMS | Persistent drafts, previews, published snapshots, archives, revisions, media rights, SEO, redirects and content propagation tested locally. Some content types use structured fields instead of specialized editors. |
| CRM / quotes / orders | Database-backed quotation, acceptance, contracts and order/project creation verified locally; available to MFA admins, with customer production access disabled. |
| Projects / milestones | Kanban, subtasks, dependencies, team assignment, weighted milestone progress, templates, private time and history implemented. Complex resource scheduling is partial. |
| Messaging | Customer/admin threads, search, near-real-time polling, reconnection, attachments, read state, internal notes and customer isolation tested locally; available to MFA admins, with customer production access disabled. |
| Delivery / acceptance | Versioned files, approval/revision decisions and final handover guards tested locally; available to MFA admins, with customer production access disabled. |
| Billing | Itemized draft editing, sequential immutable finalization, PDF/history, partial allocation, dates, due/overdue, deposits, credit notes, refunds, manual verification and currency-separated reports tested in sandbox. Not legal tax invoices. |
| Recurring agreements | Month-end billing anchors, idempotent recurring draft creation, renewal notices and customer cancellation requests tested locally. No automatic real charges. |
| Notifications | Database outbox, Redis hints, worker, retries, stable IDs, preferences, logs and configurable published templates. Worker is running; **actual email delivery is unavailable** without dedicated verified SMTP. |
| Support / operations | Persisted support threads, internal replies, first-response timing, real-record business/CRM/project reports, CSV export, audit and permissions tested locally. Gated in production. |
| Administration | Connected UI and permissions tested with QA MFA identities. Actual production owner enrollment and MFA sign-in are verified. |

The status vocabulary and practical limits are maintained in `feature-coverage.md`.

## Security, review privacy and recovery

Password hashing, CSRF rejection, persistent login lockout, session revocation, multi-customer isolation, role escalation denial, file ownership, internal attachment privacy, file magic validation and sandbox callback signatures/replay prevention have executed tests. Privileged routes require a verified MFA-protected studio session. Customer accounts remain disabled in the admin-only release. No development/debug authentication bypass is exposed.

All 74 screenshot hashes were reviewed against the preserved inventory. Photos/logos and missing republication permission prevent public image publication. The owner approved exactly six anonymized text excerpts, including the original individual 4.7/5 rating where applicable; no aggregate rating is claimed. Originals, derivatives and historical captures are excluded from public history. Authorized private evidence delivery verifies the original hash.

Recent own-container logs were compared against configured secret values, with zero matches reported and no secret values printed. This is a targeted check, not proof against every possible sensitive log payload.

Daily encrypted backup runs at 02:15 UTC. Archive `anibish-20261115T203040Z.tar.gpg` passed checksum, decryption and restore into a disposable isolated database: one enrolled owner, 26 services, 11 CMS records, eight enquiries, zero orders/payments, all 74 private originals. The archived MFA encryption key authenticated the restored owner's actual MFA ciphertext. The API restart preserved all four final browser enquiry references, and the owner MFA session survived the final deployment.

The owner explicitly approved private local copies of the backup recovery key, initial archive and updated owner/MFA archive. They were stored in ignored `.local/launch/`, restrictive owner-only permissions; archive checksums matched the VPS. Recovery secrets are not in source or logs. Current archives include required MFA/sandbox keys inside the encrypted payload. Full Coolify configuration recovery, automated offsite rotation, retention policy, full replacement-VPS recovery and MFA recovery codes remain outstanding. The one-off approved Mac copy is not an automated offsite backup policy.

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
| API/security test groups | **26/26 PASS**, isolated QA database |
| Continuation browser workflow groups | **12/12 PASS**, distinct QA customers and MFA admin |
| Operations mobile layouts | Five views checked without horizontal overflow |
| Final public browser assertions | **37 PASS**, desktop 1440×1000 / mobile 390×844 |
| Additional production checks | **16 PASS** in public-only mode; **17 PASS** in final admin-only mode, including customer feature disabled |
| Browser page errors | Zero in final public and operations runs |
| Sandbox invoice PDF | Downloaded, rendered and visually inspected |
| Public contact / quote / consultation | Four final synthetic submissions; verified in database after API restart |
| Encrypted restore | PASS, isolated database and 74 original files |
| Production dependency vulnerabilities | Zero known, omit-dev audit |
| Actual production customer login / isolation | NOT ENABLED / NOT EXECUTED with production customers |
| Interactive owner enrollment regression | PASS in temporary local QA database: password, TOTP, owner and audit transaction |
| Actual production admin MFA login / service edit | PASS: actual owner MFA session; service create/edit/reload/archive verified |
| Live SMTP / live payments | NOT CONFIGURED / DELIBERATELY DISABLED |

A first smoke attempt during container cutover received 503; the final run started after readiness and passed. A private-resource assertion was adjusted to verify non-image not-found content because streamed Next.js not-found responses can carry HTTP 200. No private image bytes were returned; strict unknown-route HTTP status remains a limitation.

Private screenshot gallery: `.local/launch/index.html` (32 final public images plus 13 operations/PDF images). Historical design captures: `.local/visual-audit/screenshots/index.html` (the earlier 250-capture audit, not a new production result). Route inventory: `docs/route-inventory.md`. Raw test JSON stays private under `.local/launch/`.

## Remaining owner/provider work

1. COMPLETED: private owner enrollment, authenticator verification, actual production MFA sign-in, enrollment/audit visibility and encrypted recovery. The bootstrap launcher now refuses replacement of the enrolled owner.
2. Supply dedicated ANIBISH SMTP credentials in private configuration; verify sender-domain authentication and actual delivery. Existing DNS records alone are not evidence that mail delivery works. Customer verification/recovery and Gate B depend on this.
3. Supply verified legal, GST/tax and banking details and approve final policies. Current invoices remain explicitly sandbox development records.
4. Live payment activation needs a real merchant/provider adapter, production credentials, verified signatures, duplicate/refund/reconciliation tests and separate explicit owner authorization. No real-money collection is enabled.
5. Decide ANIBISH alert destination, independent MFA/config recovery storage, offsite schedule and retention. Add MFA recovery, malware scanning where supported and independent security/accessibility review.
6. Complete specialized CMS editors and advanced resource scheduling where the generic structured workflows do not fulfill the full master brief.

Public lead capture remains independent of these payment and portal blockers.

## Owner enrollment follow-up

A full interactive QA reproduction found an audit SQL parameter conflict in the initial owner-enrollment command. Its transaction rolled back, leaving production with zero owners. Commit `190daee` fixes the parameter typing; a PTY regression now verifies hidden password entry, TOTP, owner creation and both audit/security records in a temporary isolated database. API TypeScript and lint passed, the corrected source hash matched the deployed container, and production public checks passed 16/16 again. The private launcher now explicitly distinguishes success and failure. The owner successfully retried with a new setup key. One persisted owner account, verified MFA session and successful sign-in event were independently checked. No password or TOTP was collected by the agent.

Recovery scripts now include required runtime MFA/sandbox keys inside encrypted archives and verify configuration plus any restored MFA ciphertext. Archive `anibish-20261115T202304Z.tar.gpg` restored eight enquiries and all original evidence, with zero enrolled MFA records at that point. A rehearsal interrupted by deployment was retried successfully after removing only its identified temporary database and directory. Cleanup now handles replacement containers. The later owner/MFA archive was copied only after separate explicit approval, as documented below.

## Verified production owner access

The owner completed enrollment and signed in at the actual production domain with a password and authenticator code. Database checks found one MFA-enabled verified owner, one current MFA-verified session, a successful sign-in event and the enrollment audit record. The owner session opened the real dashboard, all eight persisted synthetic enquiries, the 11 CMS entries and audit history.

Encrypted archive `anibish-20261115T203040Z.tar.gpg` recovered one owner and authenticated its actual MFA ciphertext with the archived encryption key. The owner explicitly approved copying this updated key-containing encrypted archive to private ignored Mac storage; local/server SHA-256 checksums matched. Automated offsite rotation remains outstanding.

Admin-only deployment `7a59d318-beed-4551-abf7-2ec343f81f54` finished at commit `9038bc0`. Seventeen production checks passed: anonymous admin/evidence requests return 401, malformed login is validated, registration/checkout/webhooks remain closed, customer feature is false and payment mode is sandbox. Fresh anonymous desktop/mobile contexts verified login fields, responsive fit and the admin sign-in gate without page errors.

Production service editing exposed a read/write field-name mismatch: a reloaded service returned `pricingModel` while the editor expected `pricing_model`. Commit `8d91a3c` standardizes that mapping, adds a create/read/edit/archive regression and removes inaccurate local-only workspace labels. All 26 API groups, both TypeScript checks, lint and the optimized build passed. Final deployment/browser evidence follows below.

## Final admin activation evidence

Final runtime commit `8d91a3c8ebc7d855bedac22421d30c286fb7f89b`, Coolify deployment `4983feaf-88e2-4572-b8a6-24f471c32ecf`, status finished. All five running services are healthy; migrations exited 0. The owner MFA session remained valid across deployment.

Through that actual owner browser session, an explicitly synthetic service was created as an unpublished quotation-only draft with zero placeholder amount and no price approval. Creation survived reload; editing worked; the pricing model remained selected when reopened after the fix. The record was then archived through the editor, reloaded and independently checked in PostgreSQL. It was never published. There remain exactly 26 published services and zero payment records. Owner, creation and update events were visible in the audit log.

The production inbox showed all eight saved synthetic enquiries, including the service-specific quotation and consultation request. CMS displayed all 11 persisted collections, including six approved reviews. Actual authenticated service and overview layouts fit 1440px desktop and 390px mobile widths with no horizontal overflow. Mobile quick navigation and the drawer both worked. The dashboard was left open, with temporary viewport overrides reset.

Private actual-production evidence is in `.local/launch/admin-smoke/`: desktop/mobile login, archived service, and verified dashboard captures. `.local/launch/admin-verification.json` and `admin-stage-checks.json` record outcomes without credentials. Final own-container secret-value comparison found zero matches in recent logs.

Gate C owner administration is enabled. Gate B customer accounts remain closed because actual SMTP verification/recovery and production customer tests are outstanding. Gate D real-money processing remains disabled.
