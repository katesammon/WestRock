# Server authorization policy

This is a single-company application. Permissions are declared in `shared/permissions.ts` and enforced in the API independently of navigation/button visibility. Unknown roles fail closed. The client uses the same policy to present the available workflow; changing client code cannot grant server permissions.

## Defaults

| Capability                                    | Owner / Admin | Project manager          | Estimator                 | Foreman                      |
| --------------------------------------------- | ------------- | ------------------------ | ------------------------- | ---------------------------- |
| Projects visible                              | All           | Assigned jobs            | All                       | Assigned jobs                |
| View company labor/equipment/material rates   | Yes           | Yes                      | Yes                       | No                           |
| View project rates, budgets, calculated costs | All jobs      | Assigned jobs            | All jobs                  | No                           |
| View employee directory                       | Yes           | No                       | No                        | No                           |
| Manage company rates and catalogs             | Yes           | No                       | No                        | No                           |
| Create projects                               | Yes           | Yes; creator is assigned | No                        | No                           |
| Edit project status and job cost overrides    | All jobs      | Assigned jobs            | No                        | No                           |
| Assign/remove project access                  | Yes           | No                       | No                        | No                           |
| Create/edit field reports                     | All jobs      | Assigned jobs            | No                        | Own drafts on assigned jobs  |
| Submit for review                             | Yes           | Assigned jobs            | No                        | Own drafts on assigned jobs  |
| Calculate/approve costs, return submissions   | Yes           | Assigned jobs            | No                        | No                           |
| Read reports/audio                            | All           | Assigned jobs            | Approved only             | Own reports on assigned jobs |
| Historical observations and exports           | All           | Assigned jobs            | All approved observations | No                           |
| Create/manage users and read audit log        | Yes           | No                       | No                        | No                           |

Owners/admins are highly trusted company-wide roles. Estimators intentionally receive company rate history, including loaded labor components, to support estimating. Foremen receive catalog IDs/names/units for reporting, not wages, rate history, financial item metadata, employee records, budgets, contract values, cost snapshots, or observations. Their prior-day context is limited to their own approved reports. A field transcript may itself contain figures entered by the author; access control does not attempt to censor source text.

## Assignments

Owners/admins open a project's **Team access** tab and assign active foremen and project managers. Membership is keyed by user/project, not supplied by the browser as proof of access. Direct nested project URLs, report IDs, private recordings, list endpoints, and historical queries all enforce scope. Removing an assignment immediately blocks future requests through an existing session. An author does not retain access to a job after their assignment is removed.

Upgrading an existing database adds an empty membership table. It deliberately does **not** infer assignments from previous authorship or give every manager/foreman access to existing jobs. Owners/admins must assign them explicitly. Owner/admin/estimator company-wide scopes do not require memberships.

## Submit versus approve

Foremen save drafts and select **Submit for review**. Submission validates field data without looking up or disclosing financial rates. A submitted report is locked for editing. A manager can calculate and approve it, or **Return for changes** with a reason visible to the author. Calculated observations are created only at approval. Manager-authored drafts can still be calculated/approved directly. Current policy permits managers to approve their own reports; organizations requiring independent reviewers should add that explicit rule before rollout.

Submitted state is stored as an additive `submitted_at` field while retaining the existing database status constraint; the API exposes `submitted` as a distinct status. Existing approved financial records are not rewritten. Draft revisions and calculation hashes continue to prevent stale approval.

## User administration

Company data → **Team access** supports account creation, role changes, and disabling users. Role/active changes revoke all sessions for that user. Disabled users cannot sign in. Owner access and the acting administrator's own role/active status cannot be changed through this endpoint. Ownership transfer is not implemented. User creation cannot supply an owner role or arbitrary permission overrides.

## Extending and validating the policy

Add a named permission and explicit role grants in `shared/permissions.ts`, then protect the server route with `requirePermission` and apply project/report scope checks before reading or mutating records. Do not accept client-provided roles or permission arrays for authorization. Default new roles/actions to denied. Keep sensitive fields out of unauthorized API responses rather than relying on hidden UI elements.

`tests/permissions.test.ts` makes real HTTP requests as every role, including guessed IDs, cross-project access, financial response inspection, private audio, submission/return/approval, assignment revocation, role changes, and disabled accounts. Browser tests exercise owner assignments, foreman submission without financial controls, and assigned-manager approval on desktop and phone layouts.

This establishes the application authorization foundation. It is not a claim of complete production security: managed identity/MFA, deployment controls, password recovery, operational monitoring, backup/restore, and an independent security assessment remain separate work. Hosted multi-company tenancy would require company keys and isolation throughout the schema, not merely another role.
