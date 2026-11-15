# ANIBISH · Local studio platform

A premium Apple-inspired public studio and connected client/admin application. Next.js App Router, React, TypeScript, Tailwind, Fastify, PostgreSQL, Drizzle and Redis. All assets are bundled locally. No production deployment or unrelated service changes were performed.

**The master brief is not fully complete.** Core workflows work locally; advanced modules and external integrations have explicit limits in [feature coverage](docs/feature-coverage.md).

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

Optional `npm run db:seed:local` creates development-only demo accounts with random credentials in ignored `.local/demo-access.json`. Never use these fixtures in production. Register an owner account and run `npm run admin:create` to grant administrative access; MFA enrollment is required before administration.

## Explore

- `/` — public studio
- `/services` — all 26 service areas, search and filters
- `/portfolio` and `/reviews` — source-backed work and authentic review evidence
- `/login`, `/register`, `/forgot-password` — connected accounts
- `/client` — private customer workspace
- `/admin` — MFA-protected studio administration
- `/design-system` — components, theme foundations and linked route index
- `docs/screenshots/index.html` — desktop/mobile screenshot gallery

Contact, quote and consultation forms save to the local enquiry inbox. Quotes create contracts, orders, projects, milestones, conversations and invoices transactionally. Private files, messages, versioned deliveries, customer decisions and sandbox payments persist in PostgreSQL. Sandbox payments never charge funds. Email requests enter an outbox; no outbound transport is configured.

All bundled prices are labelled placeholders. Fixed service ordering requires a published service with explicit owner price approval. Professional facts and awards awaiting the missing profile PDF are clearly identified. Policy text is draft material requiring review.

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
- `public/assets` — original coastal SVG and optimized review evidence
- `docs` — route inventory, asset audit, implementation status, screenshots and coverage
- `storage` and `.local` — ignored private development state

Source screenshots in `../reviews` are preserved. All 74 were inspected and imported idempotently. [Asset report](docs/asset-import-report.json) records individual provenance and publication review status. No profile PDF was found.

Docker/Coolify configuration is prepared and explicitly unverified at runtime. There is no GitHub Actions configuration, Supabase dependency or recurring cloud service requirement.
