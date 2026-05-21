import { expect, openDesktopApp, test } from './fixtures';

test.describe('desktop workspace shell', () => {
  test('switches primary workspaces from the desktop navigation', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Coding workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Coding Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Image workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Image Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Voice workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Voice Workspace' })).toBeVisible();

    await page.getByRole('button', { name: 'Chat workspace', exact: true }).click();
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

  test('keeps diagnostics runtime and tool status scannable', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Toggle Right Panel' }).click();
    await page.getByRole('tab', { name: 'Diagnostics tab' }).click();

    await expect(page.getByText('Operator Summary')).toBeVisible();
    await expect(page.getByText('Puter Runtime')).toBeVisible();
    await expect(page.getByText('Tool Execution')).toBeVisible();
    await expect(page.getByText('Runtime').first()).toBeVisible();
    const hasHorizontalOverflow = await page.locator('.utility-panel-shell').evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('supports workstation shortcuts for workspace and diagnostics switching', async ({ page }) => {
    await openDesktopApp(page);

    await page.keyboard.down('Control');
    await page.keyboard.press('2');
    await page.keyboard.up('Control');
    await expect(page.getByRole('heading', { name: 'Coding Workspace' })).toBeVisible();

    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('D');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    await expect(page.getByRole('tab', { name: 'Diagnostics tab' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Operator Summary')).toBeVisible();

    const storedSettings = await page.evaluate(() => localStorage.getItem('ai-workstation-settings') ?? '');
    expect(storedSettings).toContain('"activeWorkspace":"coding"');
    expect(storedSettings).toContain('"lastUtilityTab":"diagnostics"');
  });

  test('restores workstation continuity after reload', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'Start Chat' }).click();
    await page.getByLabel('Message input').fill('resume this local-first workstation prompt');
    await page.getByRole('button', { name: 'Image workspace', exact: true }).click();
    await page.getByLabel('Image prompt').fill('persistent workstation image prompt');
    await page.getByRole('button', { name: 'Chat workspace', exact: true }).click();
    await page.getByLabel('Message input').press('Enter');

    await expect(page.getByText('resume this local-first workstation prompt').first()).toBeVisible();
    await page.reload();

    await expect(page.getByRole('button', { name: 'Dismiss session restored notice' })).toBeVisible();
    await page.getByRole('button', { name: 'Image workspace', exact: true }).click();
    await expect(page.getByLabel('Image prompt')).toHaveValue('persistent workstation image prompt');

    await page.keyboard.down('Control');
    await page.keyboard.press('k');
    await page.keyboard.up('Control');
    await page.getByPlaceholder('Type a command...').fill('recall prompt');
    await expect(page.getByRole('button', { name: /Recall prompt: resume this local-first workstation prompt/ })).toBeVisible();
  });
});
