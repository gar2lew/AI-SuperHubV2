import { expect, type Locator, type Page } from '@playwright/test';

type WorkspaceId = 'chat' | 'coding' | 'image' | 'voice' | 'terminal';

interface SeedMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt?: number;
}

interface SeedOptions {
  workspace?: WorkspaceId;
  messages?: SeedMessage[];
}

const defaultMessages: SeedMessage[] = [
  { role: 'user', text: 'Keep this mobile chat stable.' },
  {
    role: 'assistant',
    text: 'Ready. The composer, navigation, and scroll containers should stay usable on small screens.',
  },
];

export async function installPuterMock(page: Page) {
  await page.addInitScript(() => {
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const codeLine = `const horizontallyScrollableToken = "${'x'.repeat(180)}";`;
    const codeResponse = [
      'Here is a compact code sample for the mobile code block path.',
      '',
      '```typescript',
      'function greet(name: string) {',
      '  return `Hello ${name}`;',
      '}',
      codeLine,
      '```',
      '',
      'The block should scroll horizontally before wrapping is enabled.',
    ].join('\n');

    const textResponse = Array.from(
      { length: 4 },
      () =>
        'Streaming response for the mobile keyboard-open path. The input area should remain visible while tokens arrive.'
    ).join(' ');

    const createStream = (text: string) => ({
      async *[Symbol.asyncIterator]() {
        const chunks = text.split(/(\s+)/).filter(Boolean);
        for (let index = 0; index < chunks.length; index += 1) {
          await delay(70);
          yield { text: chunks[index] };
        }
        yield { done: true };
      },
    });

    const imageUrlForPrompt = (prompt: string) => {
      const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
        '<stop stop-color="#7450b8"/><stop offset="1" stop-color="#5dd39e"/>',
        '</linearGradient></defs>',
        '<rect width="640" height="640" fill="url(#g)"/>',
        '<circle cx="432" cy="182" r="86" fill="rgba(255,255,255,.24)"/>',
        `<text x="48" y="548" fill="white" font-family="Arial" font-size="34">${prompt.slice(0, 24)}</text>`,
        '</svg>',
      ].join('');
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };

    window.puter = {
      ai: {
        chat(messages: Array<{ content?: string | Array<{ text?: string }> }>, options?: { stream?: boolean }) {
          const content = messages.at(-1)?.content;
          const last = (Array.isArray(content) ? content.map((part) => part.text ?? '').join(' ') : content ?? '').toLowerCase();
          const response = last.includes('code') ? codeResponse : textResponse;
          return options?.stream ? createStream(response) : Promise.resolve(response);
        },
        txt2img(prompt: string) {
          return Promise.resolve({ url: imageUrlForPrompt(prompt) });
        },
      },
      auth: {
        getUser: () => Promise.resolve({ username: 'e2e' }),
      },
    };
  });
}

export async function seedWorkspace(page: Page, options: SeedOptions = {}) {
  const workspace = options.workspace ?? 'chat';
  const messages = options.messages ?? defaultMessages;
  await page.addInitScript(
    ({ workspace, messages }) => {
      const now = Date.now();
      const conversationId = 'e2e-mobile-conversation';
      const conversation = {
        id: conversationId,
        title: 'Mobile E2E',
        messages: messages.map((message, index) => ({
          id: `e2e-message-${index}`,
          role: message.role,
          content: [{ type: 'text', text: message.text }],
          createdAt: message.createdAt ?? now + index,
        })),
        createdAt: now,
        updatedAt: now,
        presetId: 'smart',
        providerId: 'puter',
        modelId: 'puter-gpt-5',
      };

      localStorage.setItem(
        'ai-workstation-chat',
        JSON.stringify({
          state: {
            conversations: [conversation],
            activeConversationId: conversationId,
          },
          version: 0,
        })
      );

      localStorage.setItem(
        'ai-workstation-settings',
        JSON.stringify({
          state: {
            theme: 'dark',
            sidebarCollapsed: false,
            rightPanelOpen: false,
            autoScroll: true,
            showTimestamps: true,
            persistConversations: true,
            experimentalFeatures: {
              vision: false,
              voice: false,
              agentMode: false,
              codeInterpreter: false,
              reasoning: false,
              fallbackRouting: true,
            },
            providerSettings: {},
            selectedProvider: 'puter',
            selectedModel: 'puter-gpt-5',
            selectedPreset: 'smart',
            activeWorkspace: workspace,
          },
          version: 0,
        })
      );
    },
    { workspace, messages }
  );
}

export async function bootMobileApp(page: Page, options: SeedOptions = {}) {
  await installPuterMock(page);
  await seedWorkspace(page, options);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
}

export async function simulateKeyboardOpen(page: Page, inset = 300) {
  await page.evaluate((keyboardInset) => {
    document.documentElement.classList.add('keyboard-open');
    document.documentElement.style.setProperty('--keyboard-inset-height', `${keyboardInset}px`);
  }, inset);
}

export async function simulateKeyboardClosed(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove('keyboard-open');
    document.documentElement.style.setProperty('--keyboard-inset-height', '0px');
  });
}

export async function expectWithinViewport(locator: Locator, label: string, tolerance = 2) {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a layout box`).not.toBeNull();
  const viewport = locator.page().viewportSize();
  expect(viewport, 'viewport should be known').not.toBeNull();
  if (!box || !viewport) return;

  expect(box.x, `${label} should not be clipped on the left`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y + box.height, `${label} should not be clipped below the viewport`).toBeLessThanOrEqual(
    viewport.height + tolerance
  );
  expect(box.x + box.width, `${label} should not be clipped on the right`).toBeLessThanOrEqual(
    viewport.width + tolerance
  );
}

export async function expectNoHorizontalDocumentOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      root: root.scrollWidth - root.clientWidth,
      body: body.scrollWidth - body.clientWidth,
    };
  });

  expect(overflow.root, 'documentElement horizontal overflow').toBeLessThanOrEqual(1);
  expect(overflow.body, 'body horizontal overflow').toBeLessThanOrEqual(1);
}

export async function expectTapTargetNotObscured(locator: Locator, label: string) {
  await expectWithinViewport(locator, label);
  const result = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(x, y);
    return {
      hit: topElement === element || !!topElement?.closest('button, a, input, textarea, [role="button"]')?.isSameNode(element),
      topTag: topElement?.tagName ?? null,
      topLabel: topElement?.getAttribute('aria-label') ?? null,
    };
  });

  expect(result.hit, `${label} center should not be covered by a dead zone (${JSON.stringify(result)})`).toBe(true);
}

export function longCodeConversation(): SeedMessage[] {
  const longLine = `const mobileViewportRegressionGuard = "${'0123456789abcdef'.repeat(34)}";`;
  return [
    { role: 'user', text: 'Show a code block with a long line.' },
    {
      role: 'assistant',
      text: [
        'The following snippet is intentionally wide.',
        '',
        '```typescript',
        'export function keepMobileCodeScrollable() {',
        `  ${longLine}`,
        '  return mobileViewportRegressionGuard.length;',
        '}',
        '```',
      ].join('\n'),
    },
  ];
}
