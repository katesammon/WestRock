# Construction Cost Intelligence — first milestone

## Scope and sequence

1. Relational schema, first-owner registration, cookie sessions, role checks, and editable master data.
2. Project creation, hierarchical geography, and dated job-specific cost overrides.
3. Mobile report drafts, original text/audio, optional transcription/extraction, human correction.
4. Transactional approval, deterministic costs, production, and immutable historical observations.
5. Operational dashboard, date/region/activity/depth filters, and traceable cost components.

Estimating, accounting, payroll, predictive models, spreadsheet imports, photo/document workflows, and full insurance/overhead allocation are later milestones. This milestone reports **direct costs only**. It never treats profit as cost or applies an implicit overhead percentage.

## Runtime and persistence

React + TypeScript + Vite frontend; Express/TypeScript API; Node.js 24 built-in SQLite. SQLite is the relational local-development database (foreign keys, WAL, transactions). It is suitable for a single-node prototype. PostgreSQL migrations, hosted object storage, backups, HTTPS, monitoring, and deployment hardening are prerequisites to a multi-instance production rollout. The API owns all validation, permissions, financial arithmetic, and database writes. The frontend never supplies approved totals.

Persistent state: `.data/westrock.sqlite` and private `.data/audio/` (override root with DATA_DIR). Never commit these. Back up the database using a SQLite-aware backup, plus audio. The browser stores no company records or auth tokens. API listens on loopback by default. Production mode serves `dist/` from the API on one origin; development Vite proxies `/api` to the API.

## Relationships (see server/schema.sql)

Company 1→N users, projects, rates, equipment/material/disposal cost items. Single-company deployment. Users have owner, admin, project_manager, estimator, or foreman roles. Named server permissions and project memberships scope operations; see [permissions](permissions.md). Owners/admins manage company rates, users, and assignments. Managers operate assigned jobs. Foremen author/submit their own reports on assigned jobs without rate visibility or cost approval. Estimators read company rates and approved cost history. Only owners/admins/assigned managers calculate and approve costs; verified reports are immutable. Role changes revoke sessions. Existing jobs are not automatically assigned when migrating.

Labor classifications 1→N effective-dated rates, 1→N employees. Cost items 1→N effective-dated item rates. Project 1→N job overrides and reports. Report 1→N labor/equipment/material/disposal entries, 1→1 activity production record, 1→N immutable calculated cost lines, 1→1 historical observation on approval. Cost lines snapshot actual rates and inputs. Historical observations refer to the approved report and preserve geography, activity, depth, conditions, quantities, and components. Audit events append author, action, and timestamp. Draft revisions reject stale writes. Approval requires the reviewed revision and calculation hash, so rate changes after review force recalculation. Per-value provenance distinguishes unchanged extracted suggestions from user-confirmed edits. Sessions store only hashes of random tokens.

## Explicit assumptions

- USD; money stored in integer cents, input rates in dollars with at most two decimals. Decimal arithmetic and HALF_UP rounding per cost line. Quantities up to three decimals; hours up to two decimals.
- Labor entries are classification-based aggregated worker counts, not payroll/timecards. Each row records per-worker regular, overtime, double-time hours. Loaded cost = base × wage multiplier + hourly fringes/burdens; overtime multiplier applies to base wage only. Payroll tax/burden are explicit hourly dollar amounts, not guessed percentages. Effective rate is selected using the report work date. Historical rates cannot overlap and cannot be edited in place.
- Equipment rates use hours, days, or each. Company hourly equipment rates may be derived from configured annual ownership + annual operating costs divided by annual utilization. These are configurable inputs, not a financing/depreciation model. Job overrides win over company rates on the work date.
- One costed production activity per report. Multiple activities require separate reports: attributing all daily cost to multiple quantities would double count cost. All report direct costs are attributed to the selected activity, explicitly confirmed by the reviewer.
- Workday hours are separate from summed labor hours. Production/hour = quantity / workday hours. No implied 8-hour shift. LF, CY, TON, EA remain separate; no automatic conversions or averages across units/activities.
- A project's contract quantity/budget apply only to its designated primary activity; dashboard progress filters that activity/unit. No forecast or variance against unrelated scope.
- Approval requires quantity > 0, workday > 0, at least one labor row and a dated rate for every line. Missing prices block approval. Unknown values stay blank. Reporting partial work without labor or production is not supported in this costed-report milestone.

## AI and provenance

Optional server-only AI_API_KEY targets api.openai.com. Use the provider transcription and structured extraction endpoints; preserve original audio, transcript, raw extraction response, model, inherited context, and user-confirmed draft separately. Model output is untrusted, schema-validated, and may only reference known catalog IDs. Missing/ambiguous values remain null and become follow-up prompts. Never use model arithmetic for money. No AI credentials means manual text and structured editing remain fully usable; do not label manual drafts as AI output.

Previous-day context is offered explicitly, dated strictly before the new report, and remains editable. It never silently copies production quantity or workday hours. Inherited rows need review; rates are always reselected at approval.

## Security and limitations

First account creates the company and owner once in a database transaction. Additional users are created by owner/admin with temporary passwords; password change is available. Scrypt password hashes, HttpOnly SameSite cookies, token-hash sessions, 12-hour expiry, login throttling, same-origin write checks, private audio routes, and server-side role enforcement. Production must run behind HTTPS with NODE_ENV=production (Secure cookies). No password reset email or SSO yet; losing all owner credentials requires an administrator-led recovery. Audio limited to 20 MB and provider-supported media types. No public file URLs.

Readiness is established by financial unit tests, API integration tests with isolated temporary databases, and browser workflows. No seeded company records or example prices are inserted in the app.
