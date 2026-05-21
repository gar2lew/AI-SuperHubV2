import { expect, test as base, type Page } from '@playwright/test';

type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  createdAt: number;
};

type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
  presetId: string;
  providerId: string;
  modelId: string;
};

const IMAGE_DATA_URL =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"%3E%3Crect width="320" height="220" fill="%23132233"/%3E%3Ccircle cx="92" cy="88" r="42" fill="%2327d3a2"/%3E%3Crect x="150" y="64" width="112" height="92" rx="14" fill="%23f2b84b"/%3E%3Ctext x="160" y="181" fill="white" font-family="Arial" font-size="18"%3EE2E artifact%3C/text%3E%3C/svg%3E';

const AUDIO_DATA_URL =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

export const test = base.extend({
  page: async ({ context, page }, use) => {
    await context
      .grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: 'http://127.0.0.1:4173',
      })
      .catch(() => undefined);

    await page.addInitScript(
      ({ audioDataUrl, imageDataUrl }) => {
        const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            text: '',
            async writeText(value: string) {
              this.text = String(value);
            },
            async readText() {
              return this.text;
            },
          },
        });

        const fireMediaEvent = (target: HTMLMediaElement, name: string) => {
          const event = new Event(name);
          target.dispatchEvent(event);
          const handler = (target as unknown as Record<string, unknown>)[`on${name}`];
          if (typeof handler === 'function') {
            handler.call(target, event);
          }
        };

        HTMLMediaElement.prototype.play = function playMock() {
          window.setTimeout(() => fireMediaEvent(this, 'play'), 0);
          window.setTimeout(() => fireMediaEvent(this, 'ended'), 800);
          return Promise.resolve();
        };

        HTMLMediaElement.prototype.pause = function pauseMock() {
          fireMediaEvent(this, 'pause');
        };

        const extractPrompt = (messages: Array<{ content?: unknown }>) => {
          const last = [...messages].reverse().find((message) => Array.isArray(message.content));
          if (!last || !Array.isArray(last.content)) return '';
          return last.content
            .map((part) => {
              if (part && typeof part === 'object' && 'text' in part) {
                return String((part as { text?: unknown }).text ?? '');
              }
              return '';
            })
            .join(' ')
            .toLowerCase();
        };

        const responseFor = (messages: Array<{ content?: unknown }>) => {
          const prompt = extractPrompt(messages);
          if (prompt.includes('code')) {
            return [
              'Here is a deterministic code sample:',
              '',
              '```typescript',
              'function greet(name: string): string {',
              '  return `Hello, ${name}!`;',
              '}',
              '',
              "console.log(greet('Desktop E2E'));",
              '```',
            ].join('\n');
          }
          if (prompt.includes('stop')) {
            return Array.from(
              { length: 80 },
              (_, index) => `slow-stop-token-${index}`
            ).join(' ');
          }
          return 'Hello from the mocked desktop E2E provider response with enough tokens to keep the stream observable across browsers.';
        };

        window.puter = {
          auth: {
            getUser: async () => ({ username: 'desktop-e2e' }),
          },
          ai: {
            chat(messages: Array<{ content?: unknown }>, options?: { stream?: boolean }) {
              const response = responseFor(messages);
              if (!options?.stream) return Promise.resolve(response);

              return (async function* streamResponse() {
                const chunks = response.split(/(\s+)/).filter(Boolean);
                const delay = response.includes('slow-stop-token')
                  ? 180
                  : response.includes('deterministic code sample')
                    ? 25
                    : 120;
                for (let index = 0; index < chunks.length; index += 1) {
                  await sleep(delay);
                  yield { text: chunks[index] };
                }
                await sleep(160);
                yield { done: true };
              })();
            },
            txt2img: async () => ({ url: imageDataUrl }),
            img: async () => ({ url: imageDataUrl }),
            generateImage: async () => ({ url: imageDataUrl }),
            txt2speech: async () => ({ url: audioDataUrl }),
            tts: async () => ({ url: audioDataUrl }),
            speech2txt: async () => ({ text: 'transcribed desktop e2e audio' }),
            stt: async () => ({ text: 'transcribed desktop e2e audio' }),
          },
        };
      },
      { audioDataUrl: AUDIO_DATA_URL, imageDataUrl: IMAGE_DATA_URL }
    );

    await use(page);
  },
});

export { expect };

export async function openDesktopApp(
  page: Page,
  options: {
    conversations?: StoredConversation[];
    activeConversationId?: string;
    activeWorkspace?: 'chat' | 'coding' | 'image' | 'voice' | 'terminal';
  } = {}
) {
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem('ai-superhub-desktop-seeded') === 'true') return;
    sessionStorage.setItem('ai-superhub-desktop-seeded', 'true');

    localStorage.clear();
    localStorage.setItem(
      'ai-workstation-settings',
      JSON.stringify({
        state: {
          activeWorkspace: seed.activeWorkspace ?? 'chat',
          sidebarCollapsed: false,
          rightPanelOpen: false,
        },
        version: 0,
      })
    );

    if (seed.conversations) {
      localStorage.setItem(
        'ai-workstation-chat',
        JSON.stringify({
          state: {
            conversations: seed.conversations,
            activeConversationId: seed.activeConversationId ?? seed.conversations[0]?.id ?? null,
          },
          version: 0,
        })
      );
    }
  }, options);

  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
}

export function storedConversation(
  id: string,
  title: string,
  role: StoredMessage['role'],
  text: string
): StoredConversation {
  const createdAt = new Date('2026-05-13T00:00:00.000Z').getTime();

  return {
    id,
    title,
    createdAt,
    updatedAt: createdAt,
    presetId: 'balanced',
    providerId: 'puter',
    modelId: 'gpt-4o',
    messages: [
      {
        id: `${id}-message`,
        role,
        content: [{ type: 'text', text }],
        createdAt,
      },
    ],
  };
}
