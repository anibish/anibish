# Local operation and deployment preparation

No production deployment is authorized or performed. These are preparation instructions.

## Local host setup

Install Node 22, PostgreSQL 16+ and Redis. Use an application-specific PostgreSQL database and independent Redis instance. Never point these commands at another application’s database.

Copy `.env.example` to `.env`, configure `DATABASE_URL` and `REDIS_URL`, and generate independent secrets for container operation. Database URLs must percent-encode special password characters. Keep `.env`, `.local/` and `storage/` out of source control.

```
npm ci
npm run db:migrate
npm run db:import
npm run api:dev
# In a second terminal:
npm run dev
```

The import reads `../reviews` and preserves all originals. It is repeatable without duplicate records. It imports all services as drafts and all review evidence as `needs_review`. No fictional prices are published.

Optional development-only fixtures: `npm run db:seed:local`. Random access details are written to ignored `.local/demo-access.json`; demo account emails are `client@example.test` and `admin@example.test`. The admin account uses the same local password plus its generated TOTP secret. Do not use these accounts or fixtures in production. For owner setup, register a real local account, verify using the development mailbox link, then run `npm run admin:create` and enroll an authenticator.

Build using `npm run build`; `npm start` runs standalone output locally. The API remains a separate process. Set `API_INTERNAL_URL` before building if the internal API host changes.

## Docker / Coolify preparation

`compose.yaml` isolates PostgreSQL, Redis, migrations, the API and web application. PostgreSQL and Redis are not published to the host. Web binds loopback only. Unique named volumes retain application data. The migration job runs before API health checks.

Required configuration: `POSTGRES_PASSWORD`, `MFA_ENCRYPTION_KEY` (32 random bytes as 64 hex characters), `SANDBOX_PAYMENT_SECRET` and `PUBLIC_ORIGIN`. Use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` to generate a secret locally. Do not place generated values in documentation or commits.

Prepare with `docker compose config --quiet`. Build and runtime have not been verified in Docker during this batch. Review the image versions and supply the approved hostname/TLS route in Coolify. Attach only this stack to the existing Traefik network; never change another service’s labels, DNS, credentials or routing. A production deployment requires separate explicit authorization.

## Backups and restore

Before migrations, take `pg_dump --format=custom` of this application database. Back up its private file volume and the MFA encryption key independently; losing the key prevents decoding existing authenticator secrets. Redis is not the source of truth for business records.

Restore to a new isolated database and file volume, run migration verification, check file hashes and sample tenant isolation, then plan any cutover separately. No automated backup/restore rehearsal was performed. Set encryption, access permissions, retention and recovery objectives before production operation.

## Health and external setup

`GET /health` verifies PostgreSQL and reports Redis, sandbox payment mode and email-outbox status. The frontend health check requests `/`. Outbound email delivery, live payment APIs/webhooks, malware scanning, encrypted storage backups, legal policies and business tax details must be configured and independently verified before commercial use.

The payment adapter accepts integer minor units and verifies sandbox HMAC signatures. The order-payment operation uses a transaction, row lock and unique idempotency keys. A live provider adapter, incoming provider webhook endpoint and reconciliation worker are not implemented.
