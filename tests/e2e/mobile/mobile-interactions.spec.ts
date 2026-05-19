import { expect, test } from '@playwright/test';
import {
  bootMobileApp,
  expectNoHorizontalDocumentOverflow,
  expectTapTargetNotObscured,
  expectWithinViewport,
  simulateKeyboardClosed,
  simulateKeyboardOpen,
} from './helpers/mobileE2e';

test.describe('mobile layout and interaction stability', () => {
  test.beforeEach(async ({ page }) => {
    await bootMobileApp(page);
  });

  test('keeps the composer usable while the keyboard is open and a stream is active', async ({ page }) => {
    const input = page.getByLabel('Message input');
    const composer = page.locator('.composer-shell');
    const nav = page.getByLabel('Workspace navigation');

    await input.focus();
    await input.fill('please stream a response while the keyboard is open');
    await simulateKeyboardOpen(page, 280);

    await expectWithinViewport(composer, 'composer with keyboard open');
    await expect(nav, 'bottom nav should hide while keyboard-open styling is active').toHaveCSS('opacity', '0');
    await expectTapTargetNotObscured(page.getByLabel('Send message'), 'send button');

    await input.press('Enter');

    await expect(page.getByLabel('Stop generation')).toBeVisible();
    await expectWithinViewport(composer, 'composer while streaming');
    await expect(page.locator('.message-bubble.is-streaming')).toBeVisible();
    await expect(page.getByText('Streaming response for the mobile keyboard-open path')).toBeVisible();

    await expect(page.getByLabel('Message input')).toBeEnabled({ timeout: 15_000 });
    await expectWithinViewport(composer, 'composer after stream settles');
    await expectNoHorizontalDocumentOverflow(page);
  });

  test('bottom navigation is tappable, moves workspaces, and restores after keyboard close', async ({ page }) => {
    const nav = page.getByLabel('Workspace navigation');

    await expectWithinViewport(nav, 'mobile bottom navigation');
    await expectTapTargetNotObscured(page.getByLabel('Terminal workspace'), 'terminal tab');
    await page.getByLabel('Terminal workspace').tap();
    await expect(page.getByRole('heading', { name: 'Terminal Foundation' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Chat workspace').tap();
    const input = page.getByLabel('Message input');
    await input.focus();
    await simulateKeyboardOpen(page);
    await expect(nav).toHaveCSS('pointer-events', 'none');

    await simulateKeyboardClosed(page);
    await expect(nav).toHaveCSS('opacity', '1');
    await expectTapTargetNotObscured(page.getByLabel('Image workspace'), 'image tab after keyboard close');
    await page.getByLabel('Image workspace').tap();
    await expect(page.getByRole('heading', { name: 'Image Workspace' })).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalDocumentOverflow(page);
  });

  test('image generation modal opens, fits the phone viewport, and closes cleanly', async ({ page }) => {
    await page.getByLabel('Image workspace').tap();
    await page.getByLabel('Image prompt').fill('mobile modal test image');
    await page.getByLabel('Generate image').tap();

    await expect(page.getByLabel('Open image preview')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Open image preview').tap();

    const dialog = page.getByRole('dialog', { name: 'Generated image preview' });
    await expectWithinViewport(dialog, 'image preview dialog');
    await expect(dialog.locator('img')).toBeVisible();
    await expectTapTargetNotObscured(page.getByRole('button', { name: 'Close preview' }).last(), 'image modal close');

    await page.getByRole('button', { name: 'Close preview' }).last().tap();
    await expect(dialog).toBeHidden();
    await expectNoHorizontalDocumentOverflow(page);
  });

  test('terminal history scrolls on a phone without clipping the command input', async ({ page }) => {
    await page.getByLabel('Terminal workspace').tap();
    const terminalInput = page.getByLabel('Mock terminal command');

    for (let index = 0; index < 16; index += 1) {
      await terminalInput.fill(`status check ${index}`);
      await terminalInput.press('Enter');
    }

    const history = page.locator('.terminal-history');
    await expect(history.getByText('mock> status check 15')).toBeVisible();
    await history.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const scrollTop = await history.evaluate((element) => element.scrollTop);
    expect(scrollTop, 'terminal history should accept vertical scrolling').toBeGreaterThan(0);
    await expectWithinViewport(page.locator('.terminal-input-row'), 'terminal input row');
    await expectNoHorizontalDocumentOverflow(page);
  });
});
