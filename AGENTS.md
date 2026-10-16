# WestRock development workflow

- Use the existing checkout. The browser/cloud workspace and the user's local clone are separate machines.
- Work on `development` for ordinary requested changes. After appropriate checks pass, commit and push the requested changes to `development` so the user's local automatic-sync preview can receive them. Honor any explicit instruction to keep a change uncommitted or unpushed.
- Merge into or push to `main` only when the user explicitly requests it. Do not automatically promote preview changes to main.
- Local preview: check out `development`, then run `npm run dev:sync`. The watcher follows the branch selected when it starts, refreshes frontend edits, and restarts the API for backend edits. GitHub polling takes about 10 seconds; it is not instantaneous file sharing.
- Preserve user edits, `.data` company records, `.env`, credentials, and local commits. Never reset/discard local work to make automatic syncing proceed.
- Use Node.js 24. Validate changes with checks appropriate to their scope: lint/build for application edits; targeted automated tests for behavior, permissions, financial arithmetic, and Git synchronization. Tests use isolated fixtures, never real company data.
- Keep server authorization independent of UI visibility. See `docs/permissions.md` and `shared/permissions.ts` before changing access rules.
