# Supported action audit

**112 actual registered mutation routes**, including generated record families and archive/restore operations. Each expanded path was checked with Fastify `hasRoute` in isolated QA. This replaces the earlier incomplete literal-route scan. Route count is not the number of UI actions: downloads, previews, navigation, filtering and role-specific variants still need a complete inventory.

**Full per-action failure-matrix sign-off: 0.** This does not negate executed workflows; it prevents claiming that shared feedback components prove every action. Complete processing, success/failure text, retry, navigation, persistence, duplicate-click, timeout and expired-session evidence must be mapped for each row. All rows remain PARTIAL until that mapping is complete.

| Method / route | Registration | Candidate UI components | Evidence / recovery | Status |
|---|---|---|---|---|
| PUT `/account/billing-profile` | api/customer-account.ts:10 | src/components/customer-account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/admin/assets/:id` | api/server.ts:127 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/admin/services` | api/server.ts:69 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/admin/services/:id` | api/server.ts:71 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/admin/services/:id` | api/server.ts:70 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/admin/team` | api/server.ts:92 | src/components/membership.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/closure` | api/server.ts:65 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/deactivate` | api/customer-account.ts:11 | src/components/customer-account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/login` | api/server.ts:56 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/logout` | api/server.ts:58 | src/components/account.tsx, src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/mfa/recovery` | api/mfa-recovery.ts:4 | src/components/mfa-recovery.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/mfa/setup` | api/server.ts:61 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/mfa/verify` | api/server.ts:62 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/organization` | api/server.ts:90 | src/components/membership.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/password` | api/server.ts:64 | src/components/account-security.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/auth/profile` | api/server.ts:63 | src/components/account-security.tsx, src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/recover` | api/server.ts:55 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/register` | api/server.ts:52 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/auth/sessions/:id` | api/server.ts:60 | src/components/membership.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/token` | api/server.ts:53 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/auth/verification/resend` | api/server.ts:54 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/checkout` | api/server.ts:104 | src/components/commerce.tsx, src/components/public-pages.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/cms/media/:id/approve` | api/cms.ts:24 | src/components/cms-tools.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/cms/pages` | api/cms.ts:13 | src/components/cms-workspace.tsx, src/components/portfolio-sources.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/cms/pages/:id` | api/cms.ts:14 | src/components/cms-workspace.tsx, src/components/portfolio-sources.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/cms/pages/:id/archive` | api/cms.ts:18 | src/components/cms-workspace.tsx, src/components/portfolio-sources.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/cms/pages/:id/publish` | api/cms.ts:17 | src/components/cms-workspace.tsx, src/components/portfolio-sources.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/cms/redirects` | api/cms.ts:22 | src/components/cms-tools.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/cms/redirects/:id` | api/cms.ts:23 | src/components/cms-tools.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/conversations` | api/server.ts · generated record family | src/components/message-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/conversations/:id` | api/server.ts · generated record family | src/components/message-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/conversations/:id` | api/server.ts · generated record family | src/components/message-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/conversations/:id/messages` | api/server.ts:107 | src/components/message-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/deliveries` | api/server.ts:110 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/deliveries/:id/decision` | api/server.ts:111 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/drafts` | api/mail-centre.ts:44 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PUT `/email/drafts/:id` | api/mail-centre.ts:45 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/drafts/:id/archive` | api/mail-centre.ts:46 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/drafts/:id/restore` | api/mail-centre.ts:46 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/folders` | api/mail-centre.ts:31 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/email/messages/:id` | api/mail-centre.ts:40 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/messages/:id/lead` | api/mail-centre.ts:55 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/messages/:id/link` | api/mail-centre.ts:54 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/messages/:id/restore-cache` | api/mail-centre.ts:37 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/messages/:id/work-item` | api/mail-centre.ts:56 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PUT `/email/retention` | api/mail-centre.ts:30 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/send` | api/mail-centre.ts:47 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PUT `/email/signatures` | api/mail-centre.ts:42 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/email/sync` | api/mail-centre.ts:35 | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/enquiries` | api/server.ts:72 | src/components/extra-pages.tsx, src/components/operations.tsx, src/components/public-pages.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/files` | api/server.ts:108 | src/components/cms-tools.tsx, src/components/message-thread.tsx, src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/agreements` | api/finance.ts:26 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/agreements/:id/cancel` | api/finance.ts:28 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/invoices` | api/finance.ts:16 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/finance/invoices/:id` | api/finance.ts:17 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/invoices/:id/finalize` | api/finance.ts:18 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/manual-transfers` | api/finance.ts:20 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/manual-transfers/:id/verify` | api/finance.ts:22 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/finance/refunds/:id/record` | api/finance.ts:24 | src/components/finance-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/invitations` | api/server.ts:95 | src/components/membership.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/invitations/accept` | api/server.ts:96 | src/components/account.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/leads` | api/server.ts · generated record family | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/leads/:id` | api/server.ts · generated record family | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/leads/:id` | api/server.ts · generated record family | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/leads/:id/assign` | api/server.ts:88 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PUT `/legal/:policy` | api/legal.ts:17 | src/components/account.tsx, src/components/legal-public.tsx, src/components/legal-workspace.tsx, src/components/operations.tsx, src/components/policy-acceptance.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/legal/:policy/archive` | api/legal.ts:20 | src/components/account.tsx, src/components/legal-public.tsx, src/components/legal-workspace.tsx, src/components/operations.tsx, src/components/policy-acceptance.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/legal/:policy/publish` | api/legal.ts:18 | src/components/account.tsx, src/components/legal-public.tsx, src/components/legal-workspace.tsx, src/components/operations.tsx, src/components/policy-acceptance.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/legal/:policy/restore` | api/legal.ts:19 | src/components/account.tsx, src/components/legal-public.tsx, src/components/legal-workspace.tsx, src/components/operations.tsx, src/components/policy-acceptance.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/legal/acceptance` | api/legal.ts:15 | src/components/policy-acceptance.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/members/:id` | api/server.ts:93 | src/components/membership.tsx, src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/milestones` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/milestones/:id` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/milestones/:id` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notification-operations/:id/retry` | api/notifications.ts:8 | src/components/notification-operations.tsx, src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notification-operations/suppressions` | api/notifications.ts:7 | src/components/notification-operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PUT `/notification-templates/:key` | api/notifications.ts:10 | src/components/notification-operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notification-templates/:key/preview` | api/notifications.ts:11 | src/components/notification-operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notification-templates/:key/publish` | api/notifications.ts:12 | src/components/notification-operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notifications/:id/read` | api/server.ts:116 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/notifications/webhooks/brevo` | api/notifications.ts:5 | Mapping pending | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/payments/sandbox` | api/server.ts:112 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/payments/webhook/sandbox` | api/finance.ts:23 | Mapping pending | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/portfolio-sources/:id` | api/portfolio-sources.ts:8 | src/components/operations.tsx, src/components/portfolio-sources.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/portfolio-sources/import` | api/portfolio-sources.ts:7 | src/components/portfolio-sources.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/projects` | api/server.ts · generated record family | src/components/email-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/projects/:id` | api/server.ts · generated record family | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/projects/:id` | api/server.ts · generated record family | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/projects/:id/from-template` | api/project-management.ts:17 | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/projects/:id/handover` | api/project-management.ts:18 | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/projects/:id/team` | api/project-management.ts:11 | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/projects/:id/time` | api/project-management.ts:16 | src/components/email-workspace.tsx, src/components/operations.tsx, src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/quotes` | api/server.ts:98 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/quotes/:id` | api/server.ts:100 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/quotes/:id/decision` | api/server.ts:102 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/quotes/:id/revise` | api/server.ts:99 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/quotes/:id/send` | api/server.ts:101 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/records/:kind` | api/server.ts:119 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/records/:kind/:id` | api/server.ts:121 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/records/:kind/:id` | api/server.ts:120 | src/components/operations.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/refunds` | api/server.ts:113 | src/components/extra-pages.tsx, src/components/finance-workspace.tsx, src/components/public-pages.tsx, src/components/studio.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/review-candidates/:id` | api/reviews.ts:7 | src/components/review-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/review-candidates/batch` | api/reviews.ts:8 | src/components/review-workspace.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/tasks` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/tasks/:id` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/tasks/:id` | api/server.ts · generated record family | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/tasks/:id/dependencies` | api/project-management.ts:13 | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/tasks/:id/dependencies/:dependency` | api/project-management.ts:14 | src/components/project-workbench.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/tickets` | api/server.ts · generated record family | src/components/ticket-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| DELETE `/tickets/:id` | api/server.ts · generated record family | src/components/ticket-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| PATCH `/tickets/:id` | api/server.ts · generated record family | src/components/ticket-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |
| POST `/tickets/:id/replies` | api/operations-reports.ts:8 | src/components/ticket-thread.tsx | 55 local integration groups and workflow reports; per-action mapping pending | PARTIAL |

Executed evidence includes public form abort/timeout/duplicate-click/expired-session cases; legal consent and review bulk workflows; portfolio source/editor workflows; Email Centre draft/forwarding tests; and production customer login/logout, tenant isolation, quotation, messages/files/support, delivery revision/approval and final acceptance. These are scoped workflow checks, not blanket verification of every action.
