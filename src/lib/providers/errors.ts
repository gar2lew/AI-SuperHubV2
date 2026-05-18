export type NormalizedProviderErrorKind =
  | 'websocket'
  | 'timeout'
  | 'auth'
  | 'provider'
  | 'capability'
  | 'runtime'
  | 'unknown';

export interface NormalizedProviderError {
  kind: NormalizedProviderErrorKind;
  message: string;
  rawMessage: string;
  retryable: boolean;
}

export function normalizeProviderError(error: unknown, fallback = 'Provider request failed'): NormalizedProviderError {
  const rawMessage = error instanceof Error ? error.message : String(error || fallback);
  const message = rawMessage.toLowerCase();

  if (message.includes('websocket') || message.includes('socket') || message.includes('disconnect') || message.includes('network')) {
    return {
      kind: 'websocket',
      message: 'The provider connection was interrupted. You can retry when the connection recovers.',
      rawMessage,
      retryable: true,
    };
  }

  if (message.includes('timeout') || message.includes('timed out') || message.includes('cooling down')) {
    return {
      kind: 'timeout',
      message: message.includes('cooling down')
        ? 'Provider is recovering from a recent failure. Try again in a few seconds.'
        : 'The provider took too long to respond. Try again with a smaller request.',
      rawMessage,
      retryable: true,
    };
  }

  if (message.includes('auth') || message.includes('sign') || message.includes('permission') || message.includes('session') || message.includes('forbidden')) {
    return {
      kind: 'auth',
      message: 'Puter needs an authenticated session or permission before this request can run.',
      rawMessage,
      retryable: false,
    };
  }

  if (message.includes('unavailable') || message.includes('not available') || message.includes('unsupported') || message.includes('capability')) {
    return {
      kind: 'capability',
      message: 'This provider capability is not available in the current session.',
      rawMessage,
      retryable: false,
    };
  }

  if (message.includes('failed to load puter') || message.includes('puter load') || message.includes('requires a browser') || message.includes('outside the browser')) {
    return {
      kind: 'runtime',
      message: message.includes('requires a browser') || message.includes('outside the browser')
        ? 'This provider requires a browser runtime.'
        : 'Puter could not start in this browser session. Check connectivity or refresh the page.',
      rawMessage,
      retryable: true,
    };
  }

  if (message.includes('did not include a renderable image')) {
    return {
      kind: 'provider',
      message: 'The provider returned an image response the app could not render.',
      rawMessage,
      retryable: true,
    };
  }

  return {
    kind: rawMessage ? 'provider' : 'unknown',
    message: rawMessage || fallback,
    rawMessage,
    retryable: true,
  };
}

export function formatProviderError(error: unknown, fallback = 'Provider request failed'): string {
  return normalizeProviderError(error, fallback).message;
}

export function legacyFormatProviderError(error: unknown, fallback = 'Provider request failed'): string {
  const raw = error instanceof Error ? error.message : String(error || fallback);
  const message = raw.toLowerCase();

  if (message.includes('cooling down')) {
    return 'Provider is recovering from a recent failure. Try again in a few seconds.';
  }

  if (message.includes('failed to load puter') || message.includes('puter load timeout')) {
    return 'Puter could not start in this browser session. Check connectivity or refresh the page.';
  }

  if (message.includes('requires a browser') || message.includes('outside the browser')) {
    return 'This provider requires a browser runtime.';
  }

  if (message.includes('websocket') || message.includes('socket') || message.includes('disconnect') || message.includes('network')) {
    return 'The provider connection was interrupted. You can retry when the connection recovers.';
  }

  if (message.includes('auth') || message.includes('sign') || message.includes('permission')) {
    return 'Puter needs an authenticated session or permission before this request can run.';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'The provider took too long to respond. Try again with a smaller request.';
  }

  if (message.includes('unavailable') || message.includes('not available')) {
    return 'This provider capability is not available in the current session.';
  }

  if (message.includes('did not include a renderable image')) {
    return 'The provider returned an image response the app could not render.';
  }

  return raw || fallback;
}
