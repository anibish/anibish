# Current route conventions

Production canonical customer portal is `/dashboard`, with module navigation `/dashboard?module=<name>`. `/client` redirects to `/dashboard`. `/admin?module=reports` adds database-driven business reporting. CMS media and redirect controls are under CMS; invoices include transactions, refunds, recurring billing, transfers, credit notes and reports. Customer access remains deliberately gated; administration is enabled only for enrolled MFA-protected studio accounts.

The inventory below records original design paths; sample order identifiers are historical screen aliases, not seeded production orders. Actual order/project records are selected by UUID.

# Route and screen inventory

85 path entries; connected modules use stable query navigation. Order details are selected from actual order records, not sample URL identifiers.

| Path | Purpose |
|---|---|
| `/categories/ai-automation` | Public studio / content |
| `/categories/web-commerce` | Public studio / content |
| `/categories/mobile-education` | Public studio / content |
| `/categories/architecture-infrastructure` | Public studio / content |
| `/categories/advisory-support` | Public studio / content |
| `/` | Public studio / content |
| `/about` | Public studio / content |
| `/services` | Public studio / content |
| `/services/ai-agents` | Public studio / content |
| `/services/private-ai` | Public studio / content |
| `/services/automation` | Public studio / content |
| `/services/websites` | Public studio / content |
| `/services/saas` | Public studio / content |
| `/services/mobile` | Public studio / content |
| `/services/commerce` | Public studio / content |
| `/services/enterprise` | Public studio / content |
| `/services/backend` | Public studio / content |
| `/services/education` | Public studio / content |
| `/services/architecture` | Public studio / content |
| `/services/devops` | Public studio / content |
| `/services/security` | Public studio / content |
| `/services/advisory` | Public studio / content |
| `/services/maintenance` | Public studio / content |
| `/services/rag` | Public studio / content |
| `/services/llm` | Public studio / content |
| `/services/local-ai` | Public studio / content |
| `/services/ios` | Public studio / content |
| `/services/android` | Public studio / content |
| `/services/web-applications` | Public studio / content |
| `/services/saas-platforms` | Public studio / content |
| `/services/online-marketplaces` | Public studio / content |
| `/services/erp-crm` | Public studio / content |
| `/services/lms` | Public studio / content |
| `/services/ai-engineering` | Public studio / content |
| `/portfolio` | Public studio / content |
| `/portfolio/responsive-websites` | Public studio / content |
| `/portfolio/ssl-scanner` | Public studio / content |
| `/portfolio/learning-platform` | Public studio / content |
| `/reviews` | Public studio / content |
| `/contact` | Public studio / content |
| `/quote` | Public studio / content |
| `/checkout` | Public studio / content |
| `/login` | Public studio / content |
| `/register` | Public studio / content |
| `/forgot-password` | Public studio / content |
| `/design-system` | Public studio / content |
| `/experience` | Public studio / content |
| `/pricing` | Public studio / content |
| `/awards` | Public studio / content |
| `/insights` | Public studio / content |
| `/consultation` | Public studio / content |
| `/privacy` | Public studio / content |
| `/terms` | Public studio / content |
| `/refunds` | Public studio / content |
| `/account` | Public studio / content |
| `/client` | Authenticated customer workspace |
| `/client/catalogue` | Authenticated customer workspace |
| `/client/orders` | Authenticated customer workspace |
| `/client/projects` | Authenticated customer workspace |
| `/client/milestones` | Authenticated customer workspace |
| `/client/files` | Authenticated customer workspace |
| `/client/deliveries` | Authenticated customer workspace |
| `/client/messages` | Authenticated customer workspace |
| `/client/invoices` | Authenticated customer workspace |
| `/client/support` | Authenticated customer workspace |
| `/client/settings` | Authenticated customer workspace |
| `/client/orders/AB-026` | Authenticated customer workspace |
| `/client/orders/AB-025` | Authenticated customer workspace |
| `/client/orders/AB-024` | Authenticated customer workspace |
| `/admin` | Authenticated studio administration |
| `/admin/services` | Authenticated studio administration |
| `/admin/service-editor` | Authenticated studio administration |
| `/admin/customers` | Authenticated studio administration |
| `/admin/leads` | Authenticated studio administration |
| `/admin/orders` | Authenticated studio administration |
| `/admin/projects` | Authenticated studio administration |
| `/admin/deliveries` | Authenticated studio administration |
| `/admin/messages` | Authenticated studio administration |
| `/admin/invoices` | Authenticated studio administration |
| `/admin/portfolio` | Authenticated studio administration |
| `/admin/cms` | Authenticated studio administration |
| `/admin/settings` | Authenticated studio administration |
| `/admin/audit` | Authenticated studio administration |
| `/workspace` | Authenticated customer workspace |
| `/control` | Authenticated studio administration |

## Connected administration modules

- `/admin?module=overview`
- `/admin?module=services`
- `/admin?module=leads`
- `/admin?module=organizations`
- `/admin?module=quotes`
- `/admin?module=contracts`
- `/admin?module=orders`
- `/admin?module=projects`
- `/admin?module=milestones`
- `/admin?module=tasks`
- `/admin?module=conversations`
- `/admin?module=files`
- `/admin?module=deliveries`
- `/admin?module=invoices`
- `/admin?module=payments`
- `/admin?module=refunds`
- `/admin?module=tickets`
- `/admin?module=notifications`
- `/admin?module=cms`
- `/admin?module=portfolio`
- `/admin?module=review`
- `/admin?module=award`
- `/admin?module=experience`
- `/admin?module=blog`
- `/admin?module=faq`
- `/admin?module=navigation`
- `/admin?module=policy`
- `/admin?module=email_template`
- `/admin?module=team`
- `/admin?module=timesheet`
- `/admin?module=expense`
- `/admin?module=retainer`
- `/admin?module=campaign`
- `/admin?module=newsletter`
- `/admin?module=referral`
- `/admin?module=change_request`
- `/admin?module=risk`
- `/admin?module=requirement`
- `/admin?module=internal_note`
- `/admin?module=maintenance`
- `/admin?module=credit_note`
- `/admin?module=settings`
- `/admin?module=audit`
- `/admin?module=assets`
- `/admin?module=outbox`

## Customer modules

Overview, services, enquiries, quotations, contracts, orders, projects, milestones, tasks, conversations, files, deliveries, invoices, payments, refunds, support, notifications, requirements, change requests, maintenance and settings. Each uses `/client?module=<name>`.

Desktop screenshots use 1440 × 1000; mobile screenshots use 390 × 844. The screen gallery includes every public screen and each connected module. Canonical aliases /workspace and /control map to the client/admin workspaces.
