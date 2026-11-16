> Current production status and exact remaining work: [accelerated-production-completion.md](accelerated-production-completion.md) and [outstanding-final-register.md](outstanding-final-register.md). The earlier release evidence below is historical.

# Combined release report — 16 November 2026

The verified launch work is live. The expanded brief remains **PARTIAL**, with the outstanding items listed below. No untested feature is certified as complete.

## Production and source

- Website: https://anibish.com; canonical www redirect and valid HTTPS verified.
- Private Email Centre: https://anibish.com/admin/email.
- Legal editor: https://anibish.com/admin?module=legal.
- Public legal URLs: https://anibish.com/privacy and https://anibish.com/terms. Both show unapproved status; neither draft was published.
- Runtime: **0.3.3**, source commit `021064f99c82ccbed47d13495431b6032442f6d5`.
- Coolify application `xz0yo1hnzb8pe6nwuhvfe5tl`; final deployment `1dc2c1cc-b8d0-47b3-b0df-8d7669c4aed6` finished. Web/API/worker images match that commit; all five application services are healthy.
- Repository: https://github.com/anibish/anibish, branch `main`. Runtime commit was pushed and matched the remote. A subsequent documentation-only commit records this report; it changes no runtime code.
- Customer registration/recovery/token workflows remain closed in the admin-only production stage. Real-money processing remains disabled. Owner password and MFA were not reset or re-enrolled.

## Verified functionality

| Area | Executed evidence | Practical limit |
|---|---|---|
| Legal CMS | Tiptap draft saving, saved preview, explicit publication, history, immutable content/consents, sanitization, owner authorization, stale-version enforcement and mobile fit tested in isolated QA. Live owner editor and both unapproved drafts inspected. | Owner/legal review and final approved text are still required. Production publication was deliberately not performed. Complete customer commitment/re-acceptance UX needs its launch rehearsal. |
| Action feedback | Shared mutation processing/success/error/unknown states, request timeout handling, in-flight JSON duplicate reuse, confirmation dialog, short reduced-motion transitions. MFA login, failed login, logout revocation, protected navigation, connection interruption and CRUD browser checks passed. | Twelve browser workflows were audited; an exhaustive distinct-action total is not certified. Downloads, all upload/error combinations and every significant transition have not received an individual browser audit. |
| Hostinger | info@ and mail@ active. Existing Starter Business Email Free Trial, expiry 22 July 2027; no purchase. Both IMAP TLS 993 and SMTP 465/STARTTLS 587 authentication passed from the VPS. Actual send/receive in both directions, reply headers, attachment integrity, Sent copies and reconnect/read-state persistence passed. | Local-network authentication rejections were source-dependent; the same passwords worked from the application network. No further password changes are required. |
| DNS authentication | Authoritative ns1/ns2.dns-parking.com; Hostinger MX, one SPF record, Hostinger DKIM and both Brevo DKIM records verified. Existing DMARC policy preserved. Actual Hostinger and Brevo test receipts each passed SPF/DKIM/DMARC. | No DNS records were changed in this combined batch. |
| Brevo | Dedicated owner-supplied SMTP credentials; STARTTLS 587. Actual info@ sender with mail@ Reply-To delivered to both owner mailboxes. Production contact acknowledgement and admin alert were queued, processed and independently found in recipient inboxes. | Twenty-two responsive template definitions exist; not all business/security events have complete wiring. Verified provider delivery callbacks, bounce/complaint suppression and comprehensive delivery reporting remain incomplete. SMTP acceptance is never presented as recipient delivery. |
| Email Centre | Live MFA owner session, both private inbox caches, folders, search, pagination, plaintext/sanitized HTML, blocked remote images and attachment links verified. Actual owner UI send with attachment passed SMTP, Sent-copy and received-file integrity checks. Repeating its identifier returned the existing record. Mobile 390 px and desktop 1440 px fit verified. | Latest 100 messages per synchronized folder, background inbox refresh every two minutes; not a full historical archive. Full threaded conversation grouping, provider Archive-folder creation, configurable retention and comprehensive folder-state reconciliation remain incomplete. Attachments are download-only and unscanned. |
| Composition / CRM | Cc, reply-all headers, bounded attachments, persisted draft attachments, signatures and folder moves implemented. API tests cover private composition, unsafe filename rejection and signature access. Explicit-summary lead/task/ticket conversion and customer/project linking implemented; task isolation and idempotent creation tested. | Complete CRM correspondence activity-history presentation and production customer/project conversion rehearsal remain unverified. No original private email is silently copied to a customer-visible record. |
| Public enquiries | Final desktop/mobile contact, quote and consultation submissions persisted; actual acknowledgement delivery separately verified with the owner's real address. Validation, honeypot and CSRF rejection passed. | Four clearly marked synthetic records were created by the final public smoke run. Their .test acknowledgement recipients are suppressed in production. |

## Reviews

All **74 original files** remain private and hash-preserved. Historical contact-sheet inspection is documented in the asset audit; all 74 also received successful offline OCR in this batch.

OCR produced **75 candidate occurrences**, including two reviews in one original. Sources 49/50 are a confirmed duplicate pair. The distinct-review count is **UNVERIFIED**; the candidate upper bound is **74**, pending manual transcription/reconciliation. Six previously approved anonymized excerpts are public. Up to 68 additional distinct candidates remain withheld; this is an upper bound, not a certified exact count. All further publication still requires clearance. The published platform breakdown is six “Not specified”; no Fiverr/Freelancer endorsement or platform attribution was invented.

Homepage testimonial scrolling and the directory's search, source/rating/service filters, sorting and pagination are implemented. Five final public tests verified six cleared excerpts, truthful unknown-platform filtering, fractional-rating filtering, search empty state and mobile/private-image safeguards. A complete specialized candidate editor, exact deduplication and all service/project associations remain partial.

## Verification and recovery

- **31 API/security groups passed** against the isolated QA database.
- **12 QA browser workflows passed**, with zero page errors.
- **37 final production desktop/mobile checks passed**, across 16 routes plus navigation/submission workflows; four marked enquiry references persisted.
- **30 final production HTTP/security/gate checks passed**.
- **5 final public review checks passed**.
- Frontend/API TypeScript, lint and optimized production build passed.
- Production dependency audit: zero known production vulnerabilities at execution. This does not certify an independent penetration audit.
- Supplied mailbox/Brevo secret comparison: **zero matches in 120 tracked files**. Credentials, raw evidence, OCR, mail diagnostics and captures remain ignored/private. The temporary generated secret-import payload was removed.
- Encrypted backup `anibish-20261115T220404Z.tar.gpg` passed checksum, decryption and isolated PostgreSQL restore, including the enrolled MFA account and all 74 private originals. Presence of the dedicated mail recovery configuration inside the encrypted archive was verified without displaying values.
- No unrelated application was restarted. Observed VPS Docker health checks remained healthy. Coolify compose cutovers briefly returned 503 before routing recovered; final HTTPS returned 200.
- New production Email Centre and legal editor desktop/mobile captures are private under `.local/launch/combined-proof/`; public route captures are under `.local/launch/public-smoke/`.

## Remaining gates and work

1. **BLOCKED — legal approval:** supply/review final policies and publish through the owner editor. Draft scaffolds are not legally reviewed policies.
2. **BLOCKED — customer launch:** complete production customer consent, verification, recovery and isolation rehearsal before opening registration. The owner account was not used for a destructive password-reset test.
3. **PARTIAL — notifications:** finish remaining event wiring, authenticated provider callbacks, bounce/complaint suppression and full delivery-event reporting. No provider API/webhook setup was silently assumed from SMTP credentials.
4. **PARTIAL / UNVERIFIED — reviews:** exact transcription/deduplication, platform identification, permission clearance, specialized candidate management and all relevant associations.
5. **PARTIAL — email operations:** full history/thread grouping, archive-folder creation, retention/reconciliation and complete CRM activity-history presentation.
6. **PARTIAL — action audit:** shared infrastructure covers frontend API mutations, but the full action-by-action verification matrix and every download/upload/transition case remain outstanding.
7. **PARTIAL — operations:** automated offsite backup transfer, retention and a full replacement-VPS recovery rehearsal remain outstanding. Mail attachment malware scanning is not configured.
8. **DISABLED — real payments:** merchant/legal/tax configuration, verified production payment tests and explicit owner activation remain required.
