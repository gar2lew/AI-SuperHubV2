import { expect, test } from '@playwright/test';
import {
  bootMobileApp,
  expectNoHorizontalDocumentOverflow,
  expectTapTargetNotObscured,
  expectWithinViewport,
  longCodeConversation,
} from './helpers/mobileE2e';

async function switchWorkspace(page: import('@playwright/test').Page, buttonName: string, heading: string) {
  const tab = page.getByRole('button', { name: buttonName });
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await expect(
    page.getByRole('heading', { name: heading }).or(page.getByText(heading, { exact: true })).first()
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('tablet scaling and wide content behavior', () => {
  test.beforeEach(async ({ page }) => {
    await bootMobileApp(page, { messages: longCodeConversation() });
  });

  test('scales chat, sidebar, and workspace navigation without tablet overflow', async ({ page }) => {
    await expect(page.locator('aside')).toBeVisible();
    await expectWithinViewport(page.getByLabel('Workspace navigation'), 'tablet workspace navigation');
    await expectWithinViewport(page.getByLabel('Message input'), 'tablet composer input');
    await expectTapTargetNotObscured(page.getByLabel('Send message'), 'tablet send button');
    await expectNoHorizontalDocumentOverflow(page);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expectWithinViewport(page.getByLabel('Workspace navigation'), 'landscape tablet navigation');
    await expectWithinViewport(page.getByLabel('Message input'), 'landscape tablet composer input');
    await expectNoHorizontalDocumentOverflow(page);
  });

  test('keeps code blocks horizontally scrollable instead of clipping wide lines', async ({ page }) => {
    const codeBlock = page.locator('.code-block').first();
    const scroller = codeBlock.locator('pre').first();

    await expect(codeBlock).toBeVisible();
    await expectWithinViewport(codeBlock, 'tablet code block');

    const metrics = await scroller.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(metrics.scrollWidth, 'seeded code block should be wider than its tablet viewport').toBeGreaterThan(
      metrics.clientWidth
    );

    await scroller.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollLeft), {
        message: 'code block should accept horizontal scrolling',
      })
      .toBeGreaterThan(0);

    await expectTapTargetNotObscured(page.getByLabel('Toggle line wrapping').first(), 'code wrap toggle');
    await expectNoHorizontalDocumentOverflow(page);
  });

  test('tablet terminal and image modal remain proportionate after workspace switches', async ({ page }) => {
    await switchWorkspace(page, 'Terminal workspace', 'Terminal Foundation');
    await expectWithinViewport(page.locator('.terminal-panel'), 'tablet terminal panel');
    await expectTapTargetNotObscured(page.getByLabel('Mock terminal command'), 'tablet terminal command input');
    await expectNoHorizontalDocumentOverflow(page);

    await switchWorkspace(page, 'Image workspace', 'Image Workspace');
    await page.getByLabel('Image prompt').fill('tablet image preview');
    await page.getByLabel('Generate image').tap();
    await expect(page.getByLabel('Open image preview')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Open image preview').tap();

    const dialog = page.getByRole('dialog', { name: 'Generated image preview' });
    await expectWithinViewport(dialog, 'tablet image preview dialog');
    await expect(dialog.locator('img')).toBeVisible();
    await expectNoHorizontalDocumentOverflow(page);
  });
});
