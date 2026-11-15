# ANIBISH launch continuation register

Date: 16 November 2026 (Asia/Kolkata).

- VERIFIED: Existing application and reports inspected; target GitHub repository is public, empty, and owned by the authorized account.
- VERIFIED: VPS SSH access, existing Coolify 4.7.5, memory/disk capacity and running resources inspected read-only.
- VERIFIED: Dedicated Coolify project ANIBISH created. Existing projects were not modified.
- VERIFIED: Authoritative nameservers are ns1/ns2.dns-parking.com. Hostinger zone exported before changes; private backup is retained outside publication history.
- VERIFIED: All 74 screenshot hashes match the previous inventory. Raw images and historical captures are private; source history will exclude them before publication.
- VERIFIED: 14 API/unit test groups pass, including new invoice, CMS, webhook, recurring billing, outbox and public-launch gate tests.
- VERIFIED: New production launch mode keeps privileged routes and account creation closed while public enquiries remain available.
- PARTIALLY IMPLEMENTED: Advanced operations UI and remaining project features are still being completed.
- BLOCKED: Actual SMTP delivery awaits dedicated ANIBISH credentials and provider verification. Existing domain mail records will be preserved.
- BLOCKED: Customer/admin launch awaits owner MFA enrollment and production recovery verification. Production will initially use public-only mode.
- BLOCKED: Raw review-image publication lacks documented rights; images remain private. Approval for six anonymized text excerpts was requested separately.
- UNVERIFIED: Deployment, HTTPS, DNS cutover and production smoke tests are pending at this checkpoint.

No live financial processing is authorized. All payment adapters, callbacks, records and reports remain explicitly sandbox-only.

## Continuation checkpoint

- VERIFIED: Sanitized source pushed to `anibish/anibish` on `main`; remote SHA matched `e628bc43538a1396afaa3a0cad2bb3764966a89c` before the next batch.
- VERIFIED: Owner approved exactly six anonymized review text excerpts on 16 November 2026. Those six records were imported into the dedicated production database. Raw images remain private.
- VERIFIED: Fresh production dependency audit reports zero known vulnerabilities.
- VERIFIED: 16 API/unit groups now pass, including dependency-cycle rejection, attachment isolation, unread/read state, private time records and persistent login lockout after API reconstruction.
- VERIFIED: Updated public-mode Next.js production build, TypeScript and lint checks pass.
- PARTIALLY IMPLEMENTED: Billing UI now binds draft invoices, finalization, PDF/history, recurring agreements, manual sandbox transfer verification, credit notes and currency-separated reports. Browser validation is still pending.
- PARTIALLY IMPLEMENTED: Messaging UI now supports authenticated attachments, replies, search and reconnection status; project scheduling APIs include team assignments, dependencies, time entries, template application and final handover. Full UI and restart coverage remain pending.
- UNVERIFIED: First Coolify deployment `vjng7hpluhwmf9nbhfnqzex1` is starting. An automatically applied migration restart policy was corrected for this application and explicitly disabled in source. DNS remains unchanged at this checkpoint.
