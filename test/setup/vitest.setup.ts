import { afterEach, beforeEach, vi } from "vitest";

const originalClipboard = navigator.clipboard;

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function installStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
}

installStorage();

beforeEach(() => {
  installStorage();

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0)
  );

  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    window.clearTimeout(id);
  });
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete window.puter;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard ?? {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});
