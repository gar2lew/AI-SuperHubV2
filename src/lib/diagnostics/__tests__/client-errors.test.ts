import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearClientErrors,
  getClientErrorSnapshot,
  installClientErrorCapture,
  recordClientError,
} from "@/lib/diagnostics/client-errors";

describe("client error aggregation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    clearClientErrors();
  });

  it("normalizes and aggregates matching errors without retaining stack traces", () => {
    const error = new Error("Puter token abc123 failed while streaming response");
    error.stack = "Error: secret\n    at C:/Users/example/private-file.ts:1:1";

    recordClientError({
      source: "stream",
      error,
      context: {
        providerId: "puter",
        streamId: "stream-123",
        ignored: { nested: "not persisted" },
      },
    });
    recordClientError({
      source: "stream",
      error: new Error("Puter token abc123 failed while streaming response"),
      context: {
        providerId: "puter",
        streamId: "stream-456",
      },
    });

    const [entry] = getClientErrorSnapshot();

    expect(entry).toMatchObject({
      source: "stream",
      name: "Error",
      message: "Puter token abc123 failed while streaming response",
      count: 2,
      context: {
        providerId: "puter",
        streamId: "stream-456",
      },
    });
    expect(JSON.stringify(entry)).not.toContain("private-file");
    expect(JSON.stringify(entry)).not.toContain("ignored");
  });

  it("captures window error and unhandled rejection events until disposed", () => {
    const dispose = installClientErrorCapture(window);

    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("lazy chunk failed") }));
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.reject(new Error("provider init failed")).catch(() => undefined),
        reason: new Error("provider init failed"),
      })
    );

    expect(getClientErrorSnapshot().map((entry) => entry.source)).toEqual([
      "unhandled-rejection",
      "window-error",
    ]);

    dispose();
    window.dispatchEvent(new ErrorEvent("error", { message: "after cleanup" }));

    expect(getClientErrorSnapshot()).toHaveLength(2);
  });

  it("persists the bounded snapshot locally and clears it on request", async () => {
    recordClientError({ source: "provider-init", message: "load failed" });

    expect(window.localStorage.getItem("ai-superhub:client-errors")).toContain("load failed");

    clearClientErrors();

    expect(getClientErrorSnapshot()).toEqual([]);
    expect(window.localStorage.getItem("ai-superhub:client-errors")).toBeNull();
  });
});
