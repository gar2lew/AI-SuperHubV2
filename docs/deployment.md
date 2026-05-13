# Vercel Deployment

AI Superhub deploys as a frontend-only Vite bundle. Deployment metadata is baked into the static build through `vite.config.ts` and surfaced in the Diagnostics panel.

## Metadata

The app displays:

- package or `VITE_APP_VERSION`
- commit SHA from `VITE_COMMIT_SHA`, `VERCEL_GIT_COMMIT_SHA`, `GITHUB_SHA`, or local git
- deployment timestamp from `VITE_DEPLOYMENT_TIMESTAMP` or the build time
- Vercel environment from `VITE_VERCEL_ENV` or `VERCEL_ENV`
- preview and production URLs from Vite/Vercel env values

Only `VITE_*` values are exposed to the browser. Do not place tokens, API keys, passwords, or private credentials in `VITE_*` variables.

## Local Checklist

Run this before creating or promoting a deployment:

```bash
npm run deploy:check
```

This performs secret-shape validation for public Vite env keys and then runs the production Vite build.

## Preview Deployment

For a Vercel preview deployment from a linked project:

```bash
npm run deploy:vercel:preview
```

This runs environment validation, `vercel pull`, `vercel build`, and `vercel deploy --prebuilt`. When `VERCEL_TOKEN` is present, the wrapper passes it to the Vercel CLI without printing its value.

For CI, provide the Vercel CLI secrets through the CI secret store:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

After Vercel returns a preview URL, validate it:

```bash
npm run deploy:preview -- https://your-preview.vercel.app
```

The preview validator checks the HTML response, Vite root element, unresolved build placeholders, and local JS/CSS asset responses.

## Production Deployment

For a direct production deploy from a linked project:

```bash
npm run deploy:vercel:prod
```

If your team validates previews before production, prefer promoting a verified preview in Vercel instead of rebuilding:

```bash
vercel promote <preview-url>
```

## Vercel Project Settings

Keep the project as a static frontend:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm ci`

No backend routes or serverless functions are required for the deployment metadata or validation flow.

## Deployment Status UI

Open Utilities > Diagnostics in the app to see the deployment status card. It shows the metadata above and a checklist covering version, commit, build time, environment, preview URL, public env safety, and frontend-only architecture.
