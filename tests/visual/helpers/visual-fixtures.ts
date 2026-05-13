import type { Page } from '@playwright/test';

type PersistedRecord = Record<string, unknown>;

const BASE_TIME = Date.UTC(2026, 0, 15, 12, 0, 0);

const settingsDefaults = {
  theme: 'dark',
  sidebarCollapsed: false,
  rightPanelOpen: false,
  autoScroll: true,
  showTimestamps: true,
  persistConversations: true,
  experimentalFeatures: {
    vision: true,
    voice: true,
    agentMode: false,
    codeInterpreter: true,
    reasoning: true,
    fallbackRouting: true,
  },
  providerSettings: {},
  selectedProvider: 'puter',
  selectedModel: 'puter-gpt-5',
  selectedPreset: 'smart',
  activeWorkspace: 'chat',
};

const primaryConversation = {
  id: 'visual-thread-primary',
  title: 'Visual regression coverage',
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME + 90_000,
  presetId: 'smart',
  providerId: 'puter',
  modelId: 'puter-gpt-5',
  messages: [
    {
      id: 'message-user-1',
      role: 'user',
      createdAt: BASE_TIME + 5_000,
      content: [
        {
          type: 'text',
          text: 'Review the sidebar density, message rendering, and composer layout for visual regression coverage.',
        },
      ],
    },
    {
      id: 'message-assistant-1',
      role: 'assistant',
      createdAt: BASE_TIME + 12_000,
      metadata: {
        provider: 'puter',
        model: 'puter-gpt-5',
        latencyMs: 842,
        reasoning: 'Checked navigation density, multimodal affordances, and code block spacing.',
      },
      content: [
        {
          type: 'text',
          text: [
            'The layout should keep a compact rhythm while preserving readable assistant responses.',
            '',
            '- Sidebar conversations remain scannable.',
            '- Markdown lists, inline `code`, and fenced code blocks stay inside the message column.',
            '- The composer keeps file controls and send actions aligned.',
            '',
            '```ts',
            'export function stableSnapshot(surface: string) {',
            "  return `${surface}: reduced-motion baseline`;",
            '}',
            '```',
          ].join('\n'),
        },
      ],
    },
    {
      id: 'message-user-2',
      role: 'user',
      createdAt: BASE_TIME + 48_000,
      content: [
        {
          type: 'text',
          text: 'Also include a compact follow-up so grouped spacing is protected.',
        },
      ],
    },
    {
      id: 'message-user-3',
      role: 'user',
      createdAt: BASE_TIME + 55_000,
      content: [
        {
          type: 'text',
          text: 'The second user message should group with the first without losing avatar alignment.',
        },
      ],
    },
    {
      id: 'message-assistant-2',
      role: 'assistant',
      createdAt: BASE_TIME + 68_000,
      content: [
        {
          type: 'text',
          text: 'Confirmed. The baseline should catch grouped message spacing, toolbar placement, timestamp alignment, and the final composer row.',
        },
      ],
    },
  ],
};

const sidebarConversations = [
  primaryConversation,
  {
    id: 'visual-thread-routing',
    title: 'Provider routing notes',
    createdAt: BASE_TIME - 86_400_000,
    updatedAt: BASE_TIME - 86_000_000,
    presetId: 'reasoning',
    providerId: 'puter',
    modelId: 'puter-claude-sonnet-4',
    messages: [],
  },
  {
    id: 'visual-thread-mobile',
    title: 'Mobile navigation QA',
    createdAt: BASE_TIME - 172_800_000,
    updatedAt: BASE_TIME - 172_000_000,
    presetId: 'fast',
    providerId: 'puter',
    modelId: 'puter-gpt-5',
    messages: [],
  },
  {
    id: 'visual-thread-diagnostics',
    title: 'Diagnostics panel pass',
    createdAt: BASE_TIME - 259_200_000,
    updatedAt: BASE_TIME - 258_000_000,
    presetId: 'smart',
    providerId: 'puter',
    modelId: 'puter-gpt-5',
    messages: [],
  },
];

export function persistedSettings(overrides: PersistedRecord = {}) {
  return {
    state: {
      ...settingsDefaults,
      ...overrides,
      experimentalFeatures: {
        ...settingsDefaults.experimentalFeatures,
        ...((overrides.experimentalFeatures as PersistedRecord | undefined) ?? {}),
      },
      providerSettings: {
        ...settingsDefaults.providerSettings,
        ...((overrides.providerSettings as PersistedRecord | undefined) ?? {}),
      },
    },
    version: 0,
  };
}

export function persistedChat(overrides: PersistedRecord = {}) {
  return {
    state: {
      conversations: sidebarConversations,
      activeConversationId: primaryConversation.id,
      ...overrides,
    },
    version: 0,
  };
}

export async function seedVisualStorage(
  page: Page,
  {
    settings = persistedSettings(),
    chat = persistedChat(),
  }: {
    settings?: ReturnType<typeof persistedSettings>;
    chat?: ReturnType<typeof persistedChat>;
  } = {}
) {
  await page.addInitScript(
    ({ settingsState, chatState }) => {
      window.localStorage.clear();
      window.localStorage.setItem('ai-workstation-settings', JSON.stringify(settingsState));
      window.localStorage.setItem('ai-workstation-chat', JSON.stringify(chatState));
    },
    { settingsState: settings, chatState: chat }
  );
}

export async function installDeterministicPuter(page: Page) {
  await page.addInitScript(() => {
    const streamTokens = ['Streaming visual baseline is active while the composer shows stop.'];

    window.puter = {
      auth: {
        getUser: async () => ({ username: 'visual-regression' }),
      },
      ai: {
        chat: (_messages: unknown, options?: { stream?: boolean }) => {
          if (!options?.stream) {
            return Promise.resolve('Deterministic visual test response.');
          }

          return {
            [Symbol.asyncIterator]() {
              let index = 0;

              return {
                async next() {
                  if (index >= streamTokens.length) {
                    await new Promise((resolve) => window.setTimeout(resolve, 30_000));
                    return {
                      done: false,
                      value: { text: '' },
                    };
                  }

                  await new Promise((resolve) => window.setTimeout(resolve, 240));
                  const text = streamTokens[index];
                  index += 1;
                  return {
                    done: false,
                    value: { text },
                  };
                },
              };
            },
          };
        },
      },
    };
  });
}
