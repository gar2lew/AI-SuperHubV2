# Visual Regression Baselines

This suite protects the high-risk layout surfaces with reduced-motion Playwright screenshots.

Run the specs:

```powershell
npx --yes @playwright/test test -c tests/visual/playwright.visual.config.ts
```

Create or intentionally refresh baselines:

```powershell
npx --yes @playwright/test test -c tests/visual/playwright.visual.config.ts --update-snapshots
```

Baseline strategy:

- Desktop and mobile Chromium projects use fixed viewport, locale, timezone, dark color scheme, and `prefers-reduced-motion: reduce`.
- Fixture helpers seed localStorage with deterministic conversations, settings, model choices, and timestamps before the app loads.
- The Puter runtime is replaced in-browser with a deterministic mock so streaming screenshots do not depend on network or auth.
- Screenshot helpers disable animations and hide caret/time/stream-cursor volatility while preserving layout space.
- Snapshot files live under `tests/visual/specs/__screenshots__/<project>/<spec>/<snapshot>.png`.

