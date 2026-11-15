# Deployment and recovery — version 0.2.0

Production uses Coolify application `xz0yo1hnzb8pe6nwuhvfe5tl`, project ANIBISH, production environment, repository `anibish/anibish`, branch `main`, Docker Compose file `ops/coolify-compose.yaml`. No GitHub Actions. Canonical website https://anibish.com; same-origin `/api`; no separate API DNS record.

## Isolation and configuration

Dedicated web, Fastify API, worker, migration job, PostgreSQL 16 and Redis 7 containers have resource limits and unique persistent volumes. PostgreSQL, Redis and API expose no host ports. Only the web service has public Traefik routing. An internal network connects data services. Migrations finish once with restart disabled, before API startup.

Coolify stores independent encrypted `ANIBISH_DB_PASSWORD`, `ANIBISH_MFA_KEY` and `ANIBISH_SANDBOX_SECRET`. Never copy another project's secrets. `PAYMENT_MODE=sandbox` is enforced. `ANIBISH_LAUNCH_STAGE` defaults to `public`. Do not change the stage merely to make screens accessible.

Public mode permits health checks, published content/services and persistent enquiries. Admin mode additionally requires an enrolled, verified, MFA-enabled super admin at startup and rejects customer login. Full mode requires separate customer gate verification. Customer registration, financial operations and privileged mutations remain unavailable publicly in the initial launch.

Private review originals live at `/data/anibish/review-evidence`, mounted read-only into this API. Only authorized MFA staff may fetch evidence, with source hash verification. Public media requires explicit rights approval; original customer screenshots are not approved.

## Owner enrollment

The interactive command has a local PTY regression check (`python3 scripts/enrollment-journey.py`) that verifies the hidden-password flow, TOTP and transactional owner/audit creation in a temporary QA database.

The owner must run the following in a private interactive terminal after the enrollment source is deployed. Do not paste passwords or authenticator secrets into chat, files or logs. The command verifies a new password twice and a real authenticator code before inserting the first owner. It refuses to replace any privileged user.

```sh
ssh -t estiva-vps 'api=$(docker ps -q --filter label=com.docker.compose.project=xz0yo1hnzb8pe6nwuhvfe5tl --filter label=com.docker.compose.service=api); docker exec -it "$api" ./node_modules/.bin/tsx api/enroll-owner.ts'
```

Enrollment alone does not open portals. Production admin access still requires successful sign-in/MFA, permissions, audit and recovery checks. Customer accounts remain closed until their own gate passes. Email verification through SMTP must not be claimed from trusted owner enrollment.

## Email

Only the worker receives optional dedicated `ANIBISH_SMTP_HOST`, `ANIBISH_SMTP_PORT`, `ANIBISH_SMTP_USER`, `ANIBISH_SMTP_PASSWORD`; sender is mail@anibish.com. Existing SPF/DKIM/DMARC records were preserved. Actual sender authentication and delivery need provider credentials and testing. The database outbox remains authoritative; Redis is a queue hint. Stable message IDs, locked jobs, retries/backoff, preferences and delivery logs are implemented. A healthy worker with `smtp_unconfigured` means process health, not successful email delivery.

## Deploy / rollback

Commit reviewed code, push only `main`, trigger this application's Coolify deployment, then inspect migration exit status and all five running health checks. Never restart unrelated applications or run broad Docker cleanup. Validate HTTPS, www 301, published content, forms and persisted records. Roll back this application to the prior verified Git commit if critical regressions occur. Database schema rollback needs an isolated restore plan, not blind reverse SQL. Current migrations are additive.

## Encrypted backup / restore

`ops/backup-anibish.sh` is installed as `/data/anibish/backup.sh`. Daily 02:15 UTC cron writes encrypted database, private uploads, original review evidence and required MFA/sandbox runtime recovery keys under `/data/anibish/backups`. GPG AES-256, SHA-256 manifests, private temporary paths and a root-only passphrase are used. `ops/verify-restore-anibish.sh` decrypts and restores into a uniquely named disposable database, checks records and 74 original files, authenticates restored MFA ciphertext with the archived encryption key, then drops only that restore database. Plaintext recovery configuration exists only in the root-only temporary work directory and is removed after encryption/verification.

The initial recovery rehearsal passed. The owner approved an additional private recovery-key copy to ignored `.local/launch/backup-recovery-key`, mode 0600. Never commit it. New archives include the MFA encryption key inside the encrypted payload; older archives such as the first approved local copy do not. A current encrypted archive must be retained independently to recover MFA after VPS loss. Full Coolify configuration recovery remains separate. Daily offsite transfer, retention policy and a complete replacement-VPS rehearsal remain outstanding.

## Local validation

Use Node 22, application-specific PostgreSQL and Redis. Copy `.env.example` to ignored `.env`; never point local seed/import/tests at production. Run `npm ci`, `npm run db:migrate`, `npm run api:dev`, and `npm run dev`. Development fixtures are optional. API tests require a database URL containing `anibish_qa`.

Run build, both TypeScript checks, lint and API tests. `scripts/continuation-journey.mjs` uses isolated QA accounts and MFA; `scripts/launch-smoke.mjs` exercises public production pages and creates clearly labelled synthetic enquiries. Captures and private test output remain ignored.
