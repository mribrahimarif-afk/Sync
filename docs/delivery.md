# Delivery

## Scope

Sync is built as a clean rebuild; the legacy `memberFlow` repository is reference only and is never modified.

### Complete product scope

- Organizations and multiple branches.
- Staff profiles, login accounts, role templates, custom roles, granular branch permissions.
- Member profiles, optional sensitive fields, documents, custom fields, import/export, history.
- Offerings, membership plans, bundles, subscriptions, entitlements.
- Invoices, partial payments, allocations, dues, member credit, refunds, financial approvals.
- Renewals, upgrades/downgrades, freeze/resume, cancellation.
- Attendance, manual check-in/out, QR cards, access decisions, automatic checkout.
- Trainers/coaches, classes, recurring sessions, bookings, batches, appointments, waitlists.
- Staff attendance/leave, compensation, payroll, payslips.
- Cash registers/closing, expenses, inventory, POS, rentals.
- Dashboards, reports, exports, in-app notifications.
- Integration foundations and operational administration.
- Detailed visual beautification after functional implementation.

### Explicit holds (not to be built until released)

1. Member mobile application.
2. Leads CRM.
3. Actual biometric machine connection. Device management, enrollment mappings, authenticated event ingestion, deduplication and a simulator are planned; hardware connectivity waits for a machine.
4. Live online payment provider connection. Configuration, provider contracts, transaction/webhook lifecycle and mock testing are planned; the real integration waits for provider selection and credentials.
5. Live WhatsApp automation and sending. Consent, templates, triggers, queues, retries, delivery history and a provider abstraction are planned; live API connection and sending are held.

## Approved membership and renewal rules

These are rules for future implementation; none is implemented yet.

- **Lifecycle:** Active -> Pending -> Overdue -> Expired. The Pending and Overdue durations are configurable club policies.
- **Renewal timing:** renewing while Pending or Overdue extends from the existing expiry. Renewing after Expired defaults to a fresh term starting today, with the admission fee charged again. An administrator can configure expired-renewal anchoring and admission-fee rules.
- **Discounts:** negotiation/discount margin is configurable. Discounts beyond delegated limits require authorized approval.
- **Overrides** require a reason, an actor and audit history.
- **Keep these concepts separate:** member profile state; subscription lifecycle; invoice/payment state and outstanding balance; physical access decision.
- **Pending is not evidence of payment.** Renewal can neither silently clear nor duplicate historical dues.
- **Multiple subscriptions are independent.** Cancellation and refund are separate actions.
- **Person-level suspension or block overrides** otherwise valid entry rights.

## Task and pull-request lifecycle

1. One task is active at a time, with one pull request per task.
2. The implementer (Claude) builds the task on a feature branch, validates it, and opens the PR with a completion report. It does not merge.
3. A separate reviewer independently reviews the actual code at the **exact HEAD SHA**. A review of any other SHA does not count.
4. Requested changes are fixed in the same PR and **reviewed again** at the new HEAD SHA.
5. Planning gives "PROCEED TO MERGE" only after approval and passing required checks.
6. Merging is a **separate instruction** carried out by the reviewer; neither implementation nor approval implies it.
7. The next task starts only after verified merge evidence.

Never rewrite Git history on `main` or force-push it. Auto-merge is not enabled. Repository branch protection is a repository setting and is **not** configured or claimed by this task.

## Required completion evidence (per task)

Repository, PR URL, branch, base SHA and final HEAD SHA; runtime and package-manager versions; implemented behavior; changed-file summary; the exact validation commands with their real results; CI status and link; startup instructions; known limitations; and any checks not run with the reason. Failed or skipped checks are reported as such, never as passed.

## Deployment

No production deployment, hosting configuration, or live-provider connection happens without explicit authorization. CI in this repository validates only; it has no deployment workflow and uses no secrets.

## CI notes

`.github/workflows/ci.yml` runs on pull requests and `main` pushes that touch `apps/`, `packages/`, `scripts/`, root workspace/config/lockfile files, or the workflow. Because of those path filters, a docs-only change does not trigger it; if branch protection later requires this check, either remove the filters or add an always-run required job, otherwise docs-only PRs would wait on a check that never reports.
