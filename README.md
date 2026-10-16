# WestRock

A starting point for a web app built with React, TypeScript, and Vite.

## Requirements

Use Node.js 24 (see `.nvmrc`) and npm. No API keys, database, or external services are required.

## Development

From this directory:

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

Edit `src/App.tsx` to build the app and `src/App.css` or `src/index.css` to style it. Vite updates the page as you save.

The npm cache is configured in `.npmrc` for this cloud workspace. Outside the cloud environment, use `npm ci --cache .npm-cache` if `/workspace` is unavailable.

## Validation and production build

```sh
npm run lint
npm run build
npm run preview -- --host 0.0.0.0 --port 4173 --strictPort
```

`build` checks TypeScript and produces the production files in `dist/`. Preview serves those files for local checks; use a static hosting provider for deployment. An automated test suite has not been added yet.

## Project layout

- `src/App.tsx`: starter screen and sample interaction
- `src/main.tsx`: React entry point
- `src/App.css`: page styles
- `src/index.css`: global styles
- `public/`: static assets
- `vite.config.ts`: Vite configuration

Dependencies are locked in `package-lock.json`. Keep this file when committing the project. Do not commit secrets; any future Vite variables prefixed with `VITE_` are exposed to the browser.
