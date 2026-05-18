import { describe, expect, it } from "vitest";
import { formatProviderError, normalizeProviderError } from "@/lib/providers/errors";

describe("provider error normalization", () => {
  it("classifies operational provider failures into stable diagnostic shapes", () => {
    expect(normalizeProviderError(new Error("WebSocket connection closed"))).toMatchObject({
      kind: "websocket",
      retryable: true,
    });
    expect(normalizeProviderError(new Error("Puter auth session expired"))).toMatchObject({
      kind: "auth",
      retryable: false,
    });
    expect(normalizeProviderError(new Error("Stream timed out"))).toMatchObject({
      kind: "timeout",
      retryable: true,
    });
    expect(normalizeProviderError(new Error("unsupported image capability"))).toMatchObject({
      kind: "capability",
      retryable: false,
    });
  });

  it("keeps user-facing provider errors backed by normalized messages", () => {
    expect(formatProviderError(new Error("network transport closed"))).toBe(
      "The provider connection was interrupted. You can retry when the connection recovers."
    );
  });
});
