// ============================================================
// PUTER RUNTIME DETECTION
// Safe loading guards for Puter.js availability.
// ============================================================

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (messages: unknown[], options?: unknown) => Promise<unknown>;
        txt2speech: (text: string) => Promise<Blob>;
        speech2txt: (audio: Blob) => Promise<string>;
        img: (prompt: string, options?: unknown) => Promise<string>;
      };
    };
  }
}

const MAX_WAIT_MS = 10000;
const POLL_INTERVAL_MS = 100;

/** Check if Puter.js runtime is available right now. */
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.puter && !!window.puter.ai;
}

/** Wait for Puter.js to become available. */
export function waitForPuter(timeoutMs = MAX_WAIT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    if (isPuterAvailable()) {
      resolve(true);
      return;
    }

    const start = Date.now();
    const timer = setInterval(() => {
      if (isPuterAvailable()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, POLL_INTERVAL_MS);
  });
}

/** Get the Puter.ai API or throw if unavailable. */
export function getPuterAI() {
  if (!isPuterAvailable()) {
    throw new Error(
      'Puter.js is not available. Ensure you are running inside Puter (https://puter.com) or have loaded puter.js correctly.'
    );
  }
  return window.puter!.ai;
}

/** Safe wrapper: returns null instead of throwing. */
export function getPuterAISafe() {
  return isPuterAvailable() ? window.puter!.ai : null;
}

/** Provider readiness state. */
export type PuterReadiness = 'ready' | 'loading' | 'unavailable';

export function getPuterReadiness(): PuterReadiness {
  if (isPuterAvailable()) return 'ready';
  // If we're in a browser but puter isn't there yet, it's loading
  if (typeof window !== 'undefined') return 'loading';
  return 'unavailable';
}
