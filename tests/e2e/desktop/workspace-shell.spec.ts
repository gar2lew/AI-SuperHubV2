import { expect, openDesktopApp, test } from './fixtures';

test.describe('desktop workspace shell', () => {
  test('switches primary workspaces from the desktop navigation', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Coding workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Coding Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Image workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Image Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Voice workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Voice Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Chat workspace' }).click();
    await expect(page.getByRole('heading', { name: 'AI Workstation' })).toBeVisible();
  });

  test('opens settings directly and through the command palette', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Light' }).click();
    await page.mouse.click(12, 12);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();

    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await page.getByPlaceholder('Type a command...').fill('settings');
    await page.getByRole('button', { name: /Open Settings/ }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });
});
