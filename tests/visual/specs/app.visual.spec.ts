import { expect, test } from '@playwright/test';
import { persistedSettings } from '../helpers/visual-fixtures';
import { expectVisualSnapshot, loadVisualApp, settleVisualState } from '../helpers/visual-page';

test('sidebar layout, chat density, message rendering, and composer @desktop', async ({ page }) => {
  await loadVisualApp(page);

  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await expect(
    page.locator('.sidebar-item').filter({ hasText: 'Visual regression coverage' })
  ).toBeVisible();
  await expect(page.getByLabel('Message input')).toBeVisible();

  await expectVisualSnapshot(page.locator('.app-shell'), 'desktop-chat-expanded.png');
});

test('collapsed sidebar keeps chat and composer stable @desktop', async ({ page }) => {
  await loadVisualApp(page, {
    settings: persistedSettings({ sidebarCollapsed: true }),
  });

  await expect(page.getByTitle('New Chat')).toBeVisible();
  await expect(page.getByLabel('Message input')).toBeVisible();

  await expectVisualSnapshot(page.locator('.app-shell'), 'desktop-chat-collapsed-sidebar.png');
});

test('settings modal baseline @desktop', async ({ page }) => {
  await loadVisualApp(page);

  await page.getByTitle('Settings').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await expectVisualSnapshot(page.locator('.modal-panel'), 'desktop-settings-modal.png');
});

test('diagnostics panel baseline @desktop', async ({ page }) => {
  await loadVisualApp(page, {
    settings: persistedSettings({ rightPanelOpen: true }),
  });

  await page.getByRole('button', { name: 'Diagnostics tab' }).click();
  await expect(page.getByText('Puter Runtime')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conversation' })).toBeVisible();

  await expectVisualSnapshot(page.locator('.utility-panel-shell'), 'desktop-diagnostics-panel.png');
});

test('key workspace baselines @desktop', async ({ page }) => {
  await loadVisualApp(page);

  const workspaces = [
    { name: 'Coding workspace', heading: 'Coding Workspace', snapshot: 'desktop-workspace-coding.png' },
    { name: 'Image workspace', heading: 'Image Workspace', snapshot: 'desktop-workspace-image.png' },
    { name: 'Voice workspace', heading: 'Voice Workspace', snapshot: 'desktop-workspace-voice.png' },
    { name: 'Terminal workspace', heading: 'Terminal Foundation', snapshot: 'desktop-workspace-terminal.png' },
  ];

  for (const workspace of workspaces) {
    await page.getByRole('button', { name: workspace.name }).click();
    await expect(page.getByRole('heading', { name: workspace.heading })).toBeVisible();
    await expectVisualSnapshot(page.locator('.app-main'), workspace.snapshot);
  }
});

test('streaming state and stop composer baseline @desktop', async ({ page }) => {
  await loadVisualApp(page);

  await page.getByLabel('Message input').fill('Show a deterministic streaming response for the visual baseline.');
  await page.getByLabel('Send message').click();

  await expect(page.getByLabel('Stop generation')).toBeVisible();
  await expect(page.getByText('Streaming visual baseline is active')).toBeVisible({ timeout: 6_000 });

  await expectVisualSnapshot(page.locator('.app-main'), 'desktop-streaming-state.png');
});

test('mobile nav, chat density, and composer baseline @mobile', async ({ page }) => {
  await loadVisualApp(page);

  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await expect(page.getByLabel('Message input')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chat workspace' })).toBeVisible();
  await page.locator('.app-main .overflow-y-auto').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await settleVisualState(page);

  await expectVisualSnapshot(page.locator('.app-shell'), 'mobile-chat-nav-composer.png');
});

test('mobile key workspace navigation baseline @mobile', async ({ page }) => {
  await loadVisualApp(page);

  await page.getByRole('button', { name: 'Terminal workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Terminal Foundation' })).toBeVisible();
  await settleVisualState(page);

  await expectVisualSnapshot(page.locator('.app-shell'), 'mobile-terminal-workspace.png');
});
