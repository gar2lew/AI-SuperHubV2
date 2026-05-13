import { expect, openDesktopApp, storedConversation, test } from './fixtures';

test.describe('desktop chat flows', () => {
  test('creates a new chat and streams a mocked provider response', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'New Chat' }).click();
    await page.getByLabel('Message input').fill('hello from desktop e2e');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByRole('main').getByText('hello from desktop e2e')).toBeVisible();
    await expect(page.getByRole('main').getByText('Hello from the mocked')).toBeVisible();
  });

  test('switches between persisted conversations from the desktop sidebar', async ({ page }) => {
    const alpha = storedConversation('conversation-alpha', 'Alpha planning', 'user', 'Alpha planning notes');
    const beta = storedConversation('conversation-beta', 'Beta research', 'assistant', 'Beta research summary');

    await openDesktopApp(page, {
      conversations: [alpha, beta],
      activeConversationId: alpha.id,
    });

    await expect(page.getByText('Alpha planning notes')).toBeVisible();
    await page.locator('.sidebar-item').filter({ hasText: 'Beta research' }).click();
    await expect(page.getByText('Beta research summary')).toBeVisible();
    await expect(page.getByText('Alpha planning notes')).toBeHidden();

    await page.locator('.sidebar-item').filter({ hasText: 'Alpha planning' }).click();
    await expect(page.getByText('Alpha planning notes')).toBeVisible();
  });

  test('stops an in-flight mocked generation', async ({ page }) => {
    await openDesktopApp(page);

    await page.getByRole('button', { name: 'New Chat' }).click();
    await page.getByLabel('Message input').fill('please stop this slow response');
    await page.getByRole('button', { name: 'Send message' }).click();

    const stop = page.getByRole('button', { name: 'Stop generation' });
    await expect(stop).toBeVisible();
    await stop.click({ force: true });

    await expect(stop).toBeHidden();
    await expect(page.getByText('Generating response...')).toBeHidden();
  });

  test('exercises assistant code block controls without provider auth', async ({ page }) => {
    const codeConversation = storedConversation(
      'conversation-code',
      'Code sample',
      'assistant',
      [
        'Here is a deterministic code sample:',
        '',
        '```typescript',
        'function greet(name: string): string {',
        '  return `Hello, ${name}!`;',
        '}',
        '',
        "console.log(greet('Desktop E2E'));",
        '```',
      ].join('\n')
    );

    await openDesktopApp(page, {
      conversations: [codeConversation],
      activeConversationId: codeConversation.id,
    });

    const codeBlock = page.locator('.code-block').filter({ hasText: 'function greet' });
    await expect(codeBlock).toBeVisible();

    await codeBlock.getByRole('button', { name: 'Toggle line wrapping' }).click();
    await codeBlock.getByRole('button', { name: 'Copy code' }).click();
    await expect(codeBlock.getByRole('button', { name: 'Copy code' })).toContainText('Copied');
    await codeBlock.getByRole('button', { name: 'Run code placeholder' }).click();
  });
});
