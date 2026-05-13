# Testing and Regression Infrastructure

This project uses deterministic unit, E2E, mobile, and visual regression suites. Provider-dependent paths are mocked in test fixtures; no Puter auth or external provider credentials are required.

## Commands

- `npm test` or `npm run test:unit` runs Vitest unit/regression tests.
- `npm run test:e2e` runs desktop Playwright flows across Chromium, Firefox, and WebKit.
- `npm run test:e2e:ci` runs the desktop Chromium smoke matrix used by `test:ci`.
- `npm run test:e2e:mobile` runs mobile and tablet Playwright flows.
- `npm run test:visual` verifies reduced-motion screenshot baselines.
- `npm run test:visual:update` refreshes visual baselines after intentional UI changes.
- `npm run test:ci` runs typecheck, production build, unit tests, desktop Chromium E2E, mobile E2E, and visual regression. Run `npm run test:e2e` separately before releases when the full Firefox/WebKit desktop matrix is required.
- `npm run test:browsers` installs the Playwright browser engines expected by CI.

## Determinism Notes

- Vitest uses jsdom with deterministic localStorage, clipboard, RAF, and browser API stubs in `test/setup/vitest.setup.ts`.
- Desktop Playwright tests inject mocked `window.puter`, clipboard, audio, image, and streaming behavior before app boot.
- Mobile tests simulate keyboard-open state through the same CSS hooks used by runtime viewport handling.
- Visual tests force reduced motion, fixed viewport/locale/timezone, dark color scheme, seeded localStorage, and stable screenshots.

## Snapshot Policy

Only update snapshots with `npm run test:visual:update` after reviewing the rendered diff and confirming the visual change is intentional.
