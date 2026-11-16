# ANIBISH · Software engineering studio

A premium Apple-inspired public studio and connected client/admin application. Next.js App Router, React, TypeScript, Tailwind, Fastify, PostgreSQL, Drizzle and Redis. Public website: https://anibish.com. Source version 0.6.1. Dedicated Coolify containers run on the existing VPS; unrelated applications are preserved.

**The master brief is not fully complete.** Public enquiries work in production. MFA-protected owner administration and the approved customer workflows are live; legal publication, consent and security gates remain enforced; see [feature coverage](docs/feature-coverage.md).

## Run locally

```
npm ci
# Configure application-specific PostgreSQL and Redis in .env.
npm run db:migrate
npm run db:import
npm run api:dev
# In another terminal:
npm run dev
```

Open http://localhost:3000. `npm run build` creates standalone output; `npm start` serves that output locally. The API runs separately. [Deployment instructions](docs/deployment.md) cover environment variables, containers, owner setup and backup preparation.

Optional `npm run db:seed:local` creates development-only demo accounts with random credentials in ignored `.local/demo-access.json`. Never use these fixtures in production. Production uses the private interactive owner enrollment in [deployment instructions](docs/deployment.md). Development fixtures must never be imported into production.

## Explore

- `/` — public studio
- `/services` — all 26 service areas, search and filters
- `/work` and `/reviews` — separate, complete published collections; `/portfolio` remains supported
- `/login`, `/register`, `/forgot-password` — connected accounts
- `/client` — private customer workspace
- `/admin` — MFA-protected studio administration
- `/design-system` — components, theme foundations and linked route index
- `.local/visual-audit/screenshots/index.html` — private local screenshot gallery

Contact, quote and consultation forms save to the application database, including in public production mode. Quotes create contracts, orders, projects, milestones, conversations and invoices transactionally. Private files, messages, versioned deliveries, customer decisions and sandbox payments persist in PostgreSQL. Sandbox payments never charge funds. Email requests enter a durable database outbox. The worker supports dedicated SMTP credentials, retries and delivery logs; dedicated Brevo SMTP and both Hostinger mailboxes have passed actual VPS send/receive tests. Customer production access passed the approved legal/consent and two-organization production rehearsal; the policy and security gates remain enforced. Disposable test accounts are retired.

All bundled prices are labelled placeholders. Fixed service ordering requires a published service with explicit owner price approval. Professional descriptions use the authorized existing profile copy; unavailable details are identified for review. Legal publication is controlled by the owner; remaining drafts require review. See [current outstanding register](docs/outstanding-final-register.md) for the latest production evidence.

## Validation

```
npm run typecheck
npm run typecheck:api
npm run lint
# A dedicated test database whose URL includes anibish_qa is required:
DATABASE_URL=postgresql://.../anibish_qa npm run test:api
npm run test:browser
npm run verify
```

The browser scripts use local Chrome by default and require development fixtures. `CHROME_PATH` overrides the executable for the screenshot audit. [Verification report](docs/design-verification.md), [API tests](api/tests/integration.test.ts), [browser journey results](docs/browser-journey.json) and [screen audit](docs/browser-verification.json) distinguish functional evidence from unverified preparation.

## Structure

- `src/app` — App Router boundaries, metadata and validated route entry
- `src/components` — public pages, connected workspace and shared UI
- `src/lib` — frontend API client and editorial fixtures
- `api` — Fastify handlers, authorization, cryptography, payment adapter, import/migration tools
- `api/migrations` — versioned relational PostgreSQL migrations
- `public/assets` — original coastal SVG; raw review evidence remains private
- `docs` — route inventory, asset audit, implementation status, screenshots and coverage
- `storage` and `.local` — ignored private development state

Source screenshots in `../reviews` are preserved. All 74 were inspected and imported idempotently. Private asset report in `.local/launch/asset-import-report.json` records individual provenance and publication review status. An authorized existing `Profile.pdf` was inspected; the newer `Profile(1).pdf` was unavailable.

The isolated production Docker/Coolify topology has been deployed and its encrypted backup restored into a disposable database. There is no GitHub Actions configuration, Supabase dependency or recurring cloud service requirement.

## Public launch (0.2.0)

`ops/coolify-compose.yaml` is the isolated production topology. The first launch used `LAUNCH_STAGE=public`. Later customer access passed the owner-approved policy and isolated-account gates; registration continues to enforce published Terms and Privacy consent. Real-money payments remain disabled. Public enquiries remain persistent. Raw customer screenshots and generated private captures were removed from the intended publication history; originals remain private. CMS publication snapshots, invoice finalization, signed sandbox callbacks and the notification worker have automated coverage. Earlier launch reports describe historical gates; use the current outstanding register for status.

Privacy & Data at `/dashboard/privacy` supports identity-confirmed personal exports, scoped requests and consent history. `/admin/compliance` is reserved for a verified Super Admin MFA session. The private governance register records evidence, assessments, incidents and retention dry runs without asserting certification. Legal review drafts and internal policies are maintained privately. Attachment release requires valid type evidence and a fresh successful malware scan; failure remains quarantined.
