import { expect, openDesktopApp, test } from './fixtures';

test.describe('desktop media flows', () => {
  test('generates and previews a mocked image artifact', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Image workspace' }).click();
    await page.getByLabel('Image prompt').fill('A deterministic desktop preview artifact');
    await page.getByRole('button', { name: 'Generate image' }).click();

    await expect(page.getByRole('button', { name: 'Open image preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Open image preview' }).click();
    await expect(page.getByRole('dialog', { name: 'Generated image preview' })).toBeVisible();

    await page
      .getByRole('dialog', { name: 'Generated image preview' })
      .getByRole('button', { name: 'Close preview' })
      .nth(1)
      .click();
    await expect(page.getByRole('dialog', { name: 'Generated image preview' })).toBeHidden();
  });

  test('plays mocked voice output with deterministic media events', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Voice workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Voice Workspace' })).toBeVisible();
    await page.getByLabel('Voice text').fill('Read this deterministic desktop E2E sentence.');
    await page.getByRole('button', { name: 'Play speech' }).click();

    await expect(page.getByText('Playing')).toBeVisible();
    await expect(page.getByText('Idle')).toBeVisible();
  });
});
