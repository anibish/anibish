# Feature register — 16 November 2026

Statuses distinguish local executed evidence from production availability. No visual screen alone counts as a functional verification.

| Module | Status | Evidence / practical limit |
|---|---|---|
| Public website, responsive navigation, services | VERIFIED | Public HTTPS pages; desktop/mobile smoke checks. 26 quotation-led service areas. |
| Contact, quote, consultation capture | VERIFIED | Server validation, rate limiting and PostgreSQL persistence; synthetic production records. Email delivery unavailable. |
| Portfolio and reviews | PARTIALLY IMPLEMENTED | Source-backed editorial work and six approved anonymized excerpts. All 74 original images private; no fabricated outcomes or public confidential galleries. |
| Authentication / tenant isolation | VERIFIED owner access; BLOCKED customer enablement | Hashing, secure cookies, CSRF, lockout, revocation, MFA and multi-customer tests. Production owner enrollment, MFA sign-in and encrypted recovery passed. Customer production access remains disabled. |
| CMS | PARTIALLY IMPLEMENTED | Persistent CRUD, drafts, preview, published snapshots, archives, revisions, SEO, media approval and redirects tested. Some content types use structured JSON rather than specialized editors. |
| CRM / quotes / orders | VERIFIED locally | Persisted quotation-to-order/project pipeline and scoped access tests. Customer production access remains closed. |
| Projects / milestones / deliveries | PARTIALLY IMPLEMENTED | Kanban, subtasks, dependencies, team, weighted milestones, private time, templates, versioned delivery, revisions and final acceptance tested locally. Advanced resource scheduling incomplete. |
| Messaging | VERIFIED locally | Separate customers/admin, search, polling/reconnection, attachments, internal notes, read state and isolation tested. Customer production access remains closed. |
| Support | VERIFIED locally | Persistent threads, private staff replies, status and first-response reporting tested. |
| Invoices | VERIFIED sandbox locally | Draft edits, line items, sequential finalization, immutable issued content, history, due/overdue, partial allocation, PDFs. Not legal tax invoices. |
| Payments / refunds | VERIFIED sandbox locally | Signed callback, replay prevention, manual transfer verification, reconciliation, refund request/record and credit notes. Real money disabled; no live provider integration. |
| Recurring billing | VERIFIED sandbox locally | Agreements, month-end anchors, idempotent recurring draft invoices, renewal notices and cancellation request tested. No automatic real charges. |
| Financial / business reports | VERIFIED locally | Database-derived, currency-separated revenue/payment/outstanding/refund reports, CRM conversion, service attribution, support response, CSV export. |
| Notifications | PARTIALLY IMPLEMENTED | Durable outbox, Redis hints, worker, retries/backoff, stable IDs, preferences, delivery log tested. BLOCKED actual SMTP delivery. |
| Administration / team permissions | PARTIALLY IMPLEMENTED | Permission enforcement and audit tested locally; production owner MFA sign-in, inbox, CMS and audit access verified; production service create/edit/reload/archive passed. |
| Backups | VERIFIED including owner MFA recovery | Encrypted archive and isolated database restore tested, including the enrolled owner's MFA ciphertext. Offsite automation and full VPS replacement rehearsal outstanding. |
| Monitoring | PARTIALLY IMPLEMENTED | ANIBISH group, website/TLS and API checks; private Docker health. Dedicated alert delivery not configured. |
| Legal / business details | BLOCKED | Owner must supply verified tax, bank and legal identity; draft policy material requires review. |
| Security review | PARTIALLY IMPLEMENTED | Automated isolation/authorization/upload/CSRF tests and production headers; no independent penetration audit, malware scanner or MFA recovery flow. |

Validation for this continuation: 26 API test groups, 12 browser workflow groups, five responsive operations views and 37 public smoke assertions. Exact deployment and final production verification are recorded in `completion-report.md`; earlier design-phase 250 captures are historical evidence, not a new production run.
