# Deployment and recovery — version 0.5.1

Production uses Coolify application `xz0yo1hnzb8pe6nwuhvfe5tl`, project ANIBISH, production environment, repository `anibish/anibish`, branch `main`, Docker Compose file `ops/coolify-compose.yaml`. No GitHub Actions. Canonical website https://anibish.com; same-origin `/api`; no separate API DNS record.

## Isolation and configuration

Dedicated web, Fastify API, worker, migration job, PostgreSQL 16 and Redis 7 containers have resource limits and unique persistent volumes. PostgreSQL, Redis and API expose no host ports. Only the web service has public Traefik routing. An internal network connects data services. Migrations finish once with restart disabled, before API startup.

Coolify stores independent encrypted `ANIBISH_DB_PASSWORD`, `ANIBISH_MFA_KEY` and `ANIBISH_SANDBOX_SECRET`. Never copy another project's secrets. `PAYMENT_MODE=sandbox` is enforced. `ANIBISH_LAUNCH_STAGE` defaults to `public`. Do not change the stage merely to make screens accessible.

Public mode permits health checks, published content/services and persistent enquiries. Admin mode additionally requires an enrolled, verified, MFA-enabled super admin at startup and rejects customer login. Full mode requires separate customer gate verification. Those initial-launch gates are historical. Customer core access has subsequently passed its own scoped production rehearsal; do not change the configured stage or infer legal approval from this document. Financial processing remains sandbox-only.

Private review originals live at `/data/anibish/review-evidence`, mounted read-only into this API. Only authorized MFA staff may fetch evidence, with source hash verification. Public media requires explicit rights approval; original customer screenshots are not approved.

## Owner enrollment

The interactive command has a local PTY regression check (`python3 scripts/enrollment-journey.py`) that verifies the hidden-password flow, TOTP and transactional owner/audit creation in a temporary QA database.

First-time enrollment only: the owner runs the following in a private interactive terminal after deployment. Existing enrolled owners must not repeat enrollment or reset working factors. Do not paste passwords or authenticator secrets into chat, files or logs. The command verifies a new password twice and a real authenticator code before inserting the first owner. It refuses to replace any privileged user.

```sh
ssh -t estiva-vps 'api=$(docker ps -q --filter label=com.docker.compose.project=xz0yo1hnzb8pe6nwuhvfe5tl --filter label=com.docker.compose.service=api); docker exec -it "$api" ./node_modules/.bin/tsx api/enroll-owner.ts'
```

Enrollment alone does not open portals. Production admin access still requires successful sign-in/MFA, permissions, audit and recovery checks. Customer accounts remain closed until their own gate passes. Email verification through SMTP must not be claimed from trusted owner enrollment.

## Email

Only the worker receives optional dedicated `ANIBISH_SMTP_HOST`, `ANIBISH_SMTP_PORT`, `ANIBISH_SMTP_USER`, `ANIBISH_SMTP_PASSWORD`; sender is mail@anibish.com. Existing SPF/DKIM/DMARC records were preserved. Actual sender authentication and delivery need provider credentials and testing. The database outbox remains authoritative; Redis is a queue hint. Stable message IDs, locked jobs, retries/backoff, preferences and delivery logs are implemented. A healthy worker with `smtp_unconfigured` means process health, not successful email delivery.

## Deploy / rollback

Commit reviewed code, push only `main`, trigger this application's Coolify deployment, then inspect migration exit status and all six dedicated running health checks. Never restart unrelated applications or run broad Docker cleanup. Validate HTTPS, www 301, published content, forms and persisted records. Roll back this application to the prior verified Git commit if critical regressions occur. Database schema rollback needs an isolated restore plan, not blind reverse SQL. Current migrations are additive.

## Encrypted backup / restore

`ops/backup-anibish.sh` is installed as `/data/anibish/backup.sh`. Daily 02:15 UTC cron writes encrypted database, private uploads, original review evidence and required MFA/sandbox and dedicated mail runtime recovery keys under `/data/anibish/backups`. GPG AES-256, SHA-256 manifests, private temporary paths and a root-only passphrase are used. `ops/verify-restore-anibish.sh` decrypts and restores into a uniquely named disposable database, checks records and 74 original files, authenticates restored MFA ciphertext with the archived encryption key, then drops only that restore database. Plaintext recovery configuration exists only in the root-only temporary work directory and is removed after encryption/verification.

The initial recovery rehearsal passed. The owner approved an additional private recovery-key copy to ignored `.local/launch/backup-recovery-key`, mode 0600. Never commit it. New archives include the MFA encryption key inside the encrypted payload; older archives such as the first approved local copy do not. A current encrypted archive must be retained independently to recover MFA after VPS loss. Full Coolify configuration recovery remains separate. Daily offsite transfer, retention policy and a complete replacement-VPS rehearsal remain outstanding.

## Local validation

Use Node 22, application-specific PostgreSQL and Redis. Copy `.env.example` to ignored `.env`; never point local seed/import/tests at production. Run `npm ci`, `npm run db:migrate`, `npm run api:dev`, and `npm run dev`. Development fixtures are optional. API tests require a database URL containing `anibish_qa`.

Run build, both TypeScript checks, lint and API tests. `scripts/continuation-journey.mjs` uses isolated QA accounts and MFA; `scripts/launch-smoke.mjs` exercises public production pages and creates clearly labelled synthetic enquiries. Captures and private test output remain ignored.

## Private mail operations

Dedicated credentials are stored in encrypted ANIBISH Coolify variables, never in the repository. Hostinger uses full mailbox usernames with TLS IMAP 993 and SMTP 465; Brevo uses its dedicated SMTP login/key and required STARTTLS 587. `ANIBISH_MAIL_ENABLED` gates private correspondence and synchronization. Only the notification worker receives Brevo SMTP configuration. Mail credentials are included only within the encrypted recovery archive; restore `mail-runtime-secrets.json` privately into the dedicated application variables. Do not print recovery configuration.

The worker refreshes each inbox every two minutes; the interface refreshes its private cache every 30 seconds and on reconnect. Synchronization paginates provider history using stable folder and UID validity identifiers, then resumes incrementally. Owner-only folder selection can synchronize other provider folders. Full retention administration remains pending. HTML is sanitized and remote images removed; attachments are download-only and require fresh validated scanner evidence. Outgoing composition accepts three attachments totaling at most 600 KB.

`outbox.status=sent` means SMTP accepted, not recipient delivery. Interrupted/ambiguous sends are marked `unknown` and require investigation rather than automatic resend. Email Centre send identifiers are idempotent and preserve ambiguous state. Production `.test` and `.invalid` recipient jobs are suppressed. Authenticated provider callbacks, bounce/suppression handling and the scoped customer launch rehearsal are implemented; SMTP acceptance remains distinct from recipient delivery. Do not enable registration or real payments based on SMTP acceptance alone.

## Operational release033–036

Take and verify the encrypted backup before migrations. Migration033 adds immutable provider-draft source snapshots and a durable job/event queue;034 adds nullable author/conversation-scoped message idempotency;035 adds task planning dates/revisions/history without moving commitments;036 only inserts missing explicitly approved public collection records. Existing owner CMS drafts, published snapshots and archives are never overwritten by the seed.

Provider Drafts sync is an explicit Super Admin MFA operation and is separate from SMTP sending. An uncertain APPEND acknowledgement requires reconciliation of the existing job; never blindly create another copy. Verified old copies may move only to verified provider Trash with native MOVE. No fallback EXPUNGE or purge is allowed. Missing capability retains the old copy with diagnostics.

Use the strict latest-schema restore check after deployment to cover mail draft jobs/events, task schedules, messages, project history, original reviews and real MFA recovery configuration. The backup archive and all credentials remain private. No new automated offsite destination has been approved.

Runtime image tags and selected API file hashes must match the deployed code commit. A later documentation-only main commit is reported separately. Public availability recovery has no stale publication cache; an authoritative unpublication must remain unpublished.

## Privacy and file-security release038–041

The additive migrations create the private governance register, customer privacy cases, attachment scan evidence and a disabled Cookie Policy draft. They preserve current published legal versions. The dedicated scanner has no published port and uses a pinned upstream image, capped resources and an isolated update network. API startup requires a successful public-media preflight. Keep the scanner out of resource-heavy build windows and verify it resumes afterward. Unavailable or stale scanning never releases unverified bytes.

Private policy drafts, risk assessments, provider contracts, incident evidence and recovery material must remain outside this repository. Register imports preserve existing owner records. Retention execution and regulator transmission remain disabled; a timer or evidence count is not a compliance certification.

## Security hardening release042

The additive authentication migration preserves enrolled factors and existing sessions. Secure cookie upgrades accept the existing verified session and move it to a host-only cookie; do not reset owner MFA or credentials. Session activity must reflect visible user interaction rather than background polling. Keep one-use factor checks and password confirmation enabled.

Application scripts use a fresh response nonce. Validate hydration, client navigation and policy editing after changes; do not restore broad inline-script permission to hide failures. Browser policy reports are untrusted, size/rate bounded and stripped of URLs, snippets and nonces before persistence. Private API responses disable caching.

File uploads enforce storage/count/headroom and concurrency limits before persistence; prior files and quarantined bytes still count. Capacity rejection must provide a recoverable error. Preserve all originals and do not free capacity by deleting customer files automatically. Both application Dockerfiles require the vendor-fixed system library; verify the built package version and dependency audit in each release.

The trusted initial-control assessment CLI accepts private evidence files, requires an explicit dry-run/apply mode, preserves official requirement provenance and never overwrites owner or later revisions. It records an assistant assessment, never owner/legal approval or independent certification. Its input files and findings remain private.

Quota/session environment defaults are documented in `.env.example` and forwarded by the dedicated Compose configuration. Project-file byte ceilings are250MiB per user,1GiB per organization and5GiB application-wide; record ceilings are200/1000/10000, with5GiB free-disk reserve and at most two concurrent buffered uploads per API process. These quotas do not claim to cover provider mail storage or every backup volume. Staff/customer idle windows default to15/30minutes and the absolute session limit to12hours. The server validates intervals; user-activity signals do not prove human presence against an already compromised same-origin client.

## Portfolio and governance release043–044

Take a verified encrypted backup before these migrations.043 permits a null actor only for truthful system-generated CMS revision provenance; authenticated CMS routes still record their actual actor.044 adds a disabled, unpublished DPA draft and expands the policy constraint without changing existing legal versions, consents or approvals. DPA publication does not execute a client agreement.

The trusted `api/portfolio-draft-import.ts` accepts an owner-private input file and an explicit `--dry-run` or `--apply` mode. It creates only anonymous private drafts, validates current completed-source hashes and preserves edited or published records on reimport. Review them through the Super Admin source coverage controls before any publication. A source order count is not a unique-project count.

New passwords use versioned, bounded scrypt parameters. Existing issued hashes remain verifiable and upgrade during a successful login only after all enabled factors and locked credential-state checks pass. Do not reset passwords or MFA to migrate hashes. Runtime images omit global npm/npx after dependency installation; build stages retain their tools. Verify the actual deployed image and application startup, not only the dependency lockfile.

Retention previews use fixed documented timestamps and explicit owner-approved basis/period fields. Legal holds default to active; previews never delete data or authorize provider operations. Unknown external backup coverage is reported as unknown rather than a zero candidate count. Retention execution remains disabled.
