# Feature register — 16 November 2026

Statuses distinguish local executed evidence from production availability. No visual screen alone counts as a functional verification.

| Module | Status | Evidence / practical limit |
|---|---|---|
| Public website, responsive navigation, services | VERIFIED | Public HTTPS pages; desktop/mobile smoke checks. 26 quotation-led service areas. |
| Contact, quote, consultation capture | VERIFIED | Server validation, rate limiting and PostgreSQL persistence; synthetic production records. Dedicated Brevo acknowledgement and admin-alert delivery now verified. |
| Portfolio and reviews | PARTIALLY IMPLEMENTED | 74 originals visually reconciled into 75 candidates / 74 distinct reviews / one duplicate. Private production bulk editor; six approved excerpts remain public, 68 distinct reviews await clearance. One source is truncated. |
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
| Notifications | PARTIALLY IMPLEMENTED | Durable outbox, Redis hints, worker, retries/backoff, stable IDs, preferences, delivery log tested. Actual Brevo and Hostinger delivery verified; authenticated request/delivered callbacks verified for two real production enquiry emails. Bounce/complaint suppression and replay handling tested locally; all event types have not been exercised through the provider. |
| Administration / team permissions | PARTIALLY IMPLEMENTED | Permission enforcement and audit tested locally; production owner MFA sign-in, inbox, CMS and audit access verified; production service create/edit/reload/archive passed. |
| Backups | VERIFIED including owner MFA recovery | Encrypted archive and isolated database restore tested, including the enrolled owner's MFA ciphertext. Offsite automation and full VPS replacement rehearsal outstanding. |
| Monitoring | PARTIALLY IMPLEMENTED | ANIBISH group, website/TLS and API checks; private Docker health. Dedicated alert delivery not configured. |
| Legal / business details | BLOCKED | Owner must supply verified tax, bank and legal identity; draft policy material requires review. |
| Security review | PARTIALLY IMPLEMENTED | Automated isolation/authorization/upload/CSRF tests and production headers; no independent penetration audit or dedicated malware scanner. One-use hashed MFA recovery with concurrent replay prevention tested locally; owner enrollment remains unchanged. |

Latest combined release: 31 API/security groups, 12 QA browser workflows, 37 final public desktop/mobile checks, 30 production HTTP/gate checks and five review-directory checks passed. See `combined-completion-report.md` for current evidence and limits. Earlier continuation: 26 API groups, 12 browser groups and five responsive operations views. Exact deployment and final production verification are recorded in `completion-report.md`; earlier design-phase 250 captures are historical evidence, not a new production run.

Current accelerated batch: see `outstanding-final-register.md`, `review-reconciliation.md` and `action-feedback-audit.md`. Forty API groups pass; the production-mode isolated VPS customer rehearsal passed seven checks with actual verification and recovery email receipts. This does not enable public customer access.
