import { expect, type Locator, type Page } from '@playwright/test';
import { installDeterministicPuter, seedVisualStorage } from './visual-fixtures';

const visualFreezeCss = `
  *,
  *::before,
  *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }

  input,
  textarea {
    caret-color: transparent !important;
  }

  .stream-cursor {
    opacity: 1 !important;
  }
`;

type ScreenshotTarget = Page | Locator;
type VisualScreenshotOptions = NonNullable<
  Parameters<ReturnType<typeof expect<Page>>['toHaveScreenshot']>[1]
>;

export async function loadVisualApp(
  page: Page,
  storage?: Parameters<typeof seedVisualStorage>[1]
) {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await installDeterministicPuter(page);
  await seedVisualStorage(page, storage);
  await page.goto('/');
  await page.addStyleTag({ content: visualFreezeCss });
  await expect(page.locator('.app-shell')).toBeVisible();
  await settleVisualState(page);
}

export async function settleVisualState(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 2_000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts?.ready;
    document.querySelectorAll<HTMLElement>('[aria-live]').forEach((node) => {
      node.setAttribute('data-visual-live-region', 'true');
    });
  });
  await page.waitForTimeout(450);
}

export async function expectVisualSnapshot(
  target: ScreenshotTarget,
  name: string,
  options: VisualScreenshotOptions = {}
) {
  const page =
    typeof (target as Locator).page === 'function'
      ? (target as Locator).page()
      : (target as Page);
  await settleVisualState(page);

  const mask = [
    page.locator('time'),
    page.locator('.stream-cursor'),
    page.locator('[data-visual-mask]'),
    ...((options as { mask?: Locator[] }).mask ?? []),
  ];

  await expect(target as Page & Locator).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    mask,
    maxDiffPixelRatio: 0.005,
    scale: 'css',
    ...options,
  });
}
