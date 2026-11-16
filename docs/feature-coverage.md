# Feature register — 16 November 2026

Executed evidence is scoped; a working screen does not prove every requirement. See outstanding-final-register.md and action-feedback-audit.md for remaining work.

| Module | Status | Evidence / limit |
|---|---|---|
| Typography | VERIFIED IN PRODUCTION | Approved 25% computed increase preserved; six-width regression evidence. |
| Public pages / services / leads | VERIFIED IN PRODUCTION | HTTPS, persisted enquiry/quotation capture, real confirmation/admin notification. |
| Portfolio | VERIFIED IN PRODUCTION / PARTIAL inventory | Nine published database-backed case studies, six recognition records; 23 repositories inventoried, 80/136 Fiverr detail pages inspected. Fourteen private grouped drafts await clearance; remaining order access blocked by human verification. |
| Reviews | VERIFIED IN PRODUCTION | 74 originals, 75 occurrences, 74 distinct public reviews, one duplicate excluded; 33 corroborated public usernames; original images private. |
| Legal / consent | VERIFIED IN PRODUCTION | Owner-published Privacy v2, Terms v1, Refunds v1; immutable versions and mandatory versioned consent. No independent legal-review claim. |
| Authentication / customer portal | VERIFIED IN PRODUCTION / PARTIAL breadth | Two approved independent test organizations, actual verification/recovery mail, secure login/logout, tenant restrictions; 14 production workflow checks and 36 layout checks. Billing profile and password/MFA-protected customer deactivation pass local tests; production release pending. Retention review/data erasure remain separate. |
| CRM / quotes / orders | VERIFIED IN PRODUCTION | Persisted zero-value synthetic acceptance creates one order/project; replay does not duplicate event jobs. Broader CRM/reporting locally tested. |
| Projects / messages / deliveries / support | VERIFIED IN PRODUCTION / PARTIAL breadth | Actual messages, scoped files, support, versioned revision/approval and final acceptance. Advanced resource scheduling remains incomplete. |
| CMS / administration | VERIFIED IN PRODUCTION / PARTIAL breadth | Owner MFA, structured content, legal/review/portfolio editors, source inventory, revisions, publication and audit. Some content types retain generic structured editors. |
| Email Centre | VERIFIED IN PRODUCTION / PARTIAL breadth | Two real Hostinger accounts, full resumable UID history, folders, search, relationship threading and private CRM links. Private draft creation/update/reload/archive/restore now verified in the production owner session; attachment forwarding and failure matrix verified locally. Provider Drafts write-back remains incomplete. |
| Brevo notifications | VERIFIED IN PRODUCTION / PARTIAL event rehearsal | Dedicated authenticated callback, actual delivery events, verification/recovery receipts, 16 QA event types delivered. Local bounce/complaint/suppression/idempotency tests; genuine provider bounce/complaint rehearsal outstanding. |
| Billing | VERIFIED LOCALLY / limited production sandbox | Draft PDF tested in production; immutable numbering, partial allocation, signed sandbox events, refunds, recurring schedules and reports locally tested. No real-money processing. |
| Action feedback | PARTIAL | 112 actual registered mutation routes inventoried; full per-action failure matrix not signed off. Scoped browser fault and production workflows documented separately. |
| Backup / operations | VERIFIED IN PRODUCTION / PARTIAL recovery breadth | Encrypted backup, checksum and isolated restore including MFA and private originals. No approved automated offsite destination or full replacement-VPS rehearsal. |
| Monitoring / security | PARTIAL | Dedicated health checks, owner MFA, isolation and upload validation; alert delivery and dedicated malware scanner unverified/unavailable. No independent penetration-test claim. |

Current candidate: 55 API groups, build, lint and both type checks pass locally. Counts from earlier reports are historical and must not be added as if they were a single new run. Customer synthetic access will be retired after final regression; consent/audit history is retained. No credentials or private order details belong in this report.
