# WestRock · Field Intelligence

A working first milestone of the Construction Cost Intelligence Platform: company rates → project costs → field report → human review → actual direct costs → historical observations.

## Run on your computer

Install **Node.js 24**, download/clone the project, then open a terminal in the project folder:

```sh
npm ci --cache .npm-cache
npm run dev
```

Open **http://localhost:5173** in your browser. This starts both the API (3001) and web app (5173). Create the first company/owner account, add company data, and create a project. No example rates or company data are inserted. Additional team accounts are created in Company data → Team access. Passwords require at least 12 characters.

The included `.npmrc` uses `/workspace/.npm-cache` in the cloud. Outside the cloud, the `--cache .npm-cache` option above uses the project folder instead. Node.js 24 is required for the built-in relational SQLite database.

## First end-to-end workflow

1. In **Company data**, add labor classifications and their dated hourly rates. Burdens and taxes are hourly dollar amounts; OT/DT multiply base wage only.
2. Add equipment, materials, and disposal items with explicit units, then dated company rates. Hourly equipment can derive its rate from annual ownership/operating costs and utilization.
3. In **Projects**, create the job with state → region → county → city, primary activity, contract quantity, and direct-cost budget. Add project-specific rate overrides in its Project costs tab.
4. Create a **Daily report** for that job/date. Record/upload audio or enter notes. Complete the structured labor, item usage, and production fields. Unknown inputs stay blank. Previous approved crew/equipment can be reused explicitly.
5. **Calculate & review** selects applicable rates on the work date and shows missing inputs, line items, and snapshots. Confirm the inputs and approve. Approval permanently records the report, direct costs, production/hour, and historical cost observation.
6. Inspect the project overview and **Cost intelligence**, filter by region/project/activity/depth/date, inspect underlying reports, or export observations to CSV.

One costed activity per report prevents double allocation of daily costs. Split multiple production activities into separate reports and attribute their costs deliberately. Partial reports without production/labor remain drafts. Overhead, project indirect costs, and profit are excluded from all displayed direct costs.

## Optional AI

Copy `.env.example` to `.env` and set `AI_API_KEY` locally, or configure the variable securely in cloud environment settings for `api.openai.com`. Never commit a key. Restart the API after setting it.

With an enabled key, upload/record audio and select **Transcribe audio**, then **Structure with AI**. Transcription uses `gpt-4o-mini-transcribe`; extraction uses `gpt-4.1-mini`. Audio and transcript content are sent to OpenAI when these actions are requested. Microphone capture needs a supported browser on HTTPS or localhost; manual transcript entry and file uploads remain available. AI output is unverified until reviewed; original extraction and source audio/transcript are preserved. AI never computes financial totals. A live provider call has not been validated without credentials.

## Validation

```sh
npm run lint
npm test
npm run build
npm run test:browser
```

Financial and API tests use temporary isolated databases and synthetic fixtures. Browser tests start isolated servers on ports 3011/5174 and cover desktop and phone layouts. They use `/usr/bin/chromium` when installed; otherwise run `npx playwright install chromium` once before browser tests. Chromium downloads require Playwright's CDN network access. Test fixture accounts are not created in the app's real database.

## Built app / deployment foundation

```sh
npm run build
npm start
```

The API serves `dist/` at port 3001. Production mode uses Secure session cookies: run behind HTTPS. The API binds to loopback by default. Configure `HOST` only as required by your reverse proxy. Do not expose Vite publicly as a production server. `npm run preview` previews static assets only and does not replace the API.

Persistent local company records and sessions live in `.data/westrock.sqlite`; source audio lives in private `.data/audio/`. `DATA_DIR` can point to a persistent volume. Keep these private, back them up with SQLite-aware tools and the accompanying audio, and never commit them. Approved records preserve historical amounts even when rates change.

## Scope

Implemented: single-company role-based sign-in; employee/classification catalogs; historical loaded labor rates; equipment/material/disposal catalogs and historical rates; derived hourly equipment costs; projects and job rate overrides; report drafts/audio/transcription/extraction integration; review/approval; deterministic direct-cost engine; production; immutable observations; filters/statistics/CSV export; audit trail.

Not yet implemented: spreadsheet import, full equipment finance/depreciation schedules, insurance/overhead databases and allocation, advanced cost alerts, estimating, plan processing, SSO/password recovery email, PostgreSQL/hosted object storage, and production deployment. This is the first operational prototype, not the complete long-term platform.

See [architecture and assumptions](docs/architecture.md) and [database schema](server/schema.sql).
