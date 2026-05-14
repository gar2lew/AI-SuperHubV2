export function formatProviderError(error: unknown, fallback = 'Provider request failed'): string {
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
