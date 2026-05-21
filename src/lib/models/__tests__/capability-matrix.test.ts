import { describe, expect, it } from "vitest";
import {
  detectCapabilityIntent,
  getCapabilitySummary,
  getModelCapabilities,
  resolveCapabilityFallbacks,
  supportsRuntimeCapability,
} from "@/lib/models/capability-matrix";

describe("capability matrix", () => {
  it("normalizes rich runtime capabilities for model inspection", () => {
    const capabilities = getModelCapabilities("puter-gpt-5");

    expect(capabilities).toMatchObject({
      modelId: "puter-gpt-5",
      providerId: "puter",
      streaming: true,
      vision: true,
      tools: true,
      reasoning: true,
      coding: true,
      realtimeWeb: true,
      structuredOutput: true,
      maxContext: expect.any(Number),
      fallbackEligible: true,
    });
    expect(supportsRuntimeCapability("puter-gpt-5", "realtimeWeb")).toBe(true);
  });

  it("summarizes unsupported capabilities without leaking routing logic into UI", () => {
    const summary = getCapabilitySummary("gpt-image-1-mini", ["imageGeneration", "streaming"]);

    expect(summary.supported).toContain("imageGeneration");
    expect(summary.missing).toContain("streaming");
    expect(summary.label).toContain("Image generation");
  });

  it("resolves capability-compatible fallbacks deterministically", () => {
    const fallbacks = resolveCapabilityFallbacks("gpt-image-1-mini", ["streaming"]);

    expect(fallbacks.every((model) => model.capabilities.streaming)).toBe(true);
    expect(fallbacks.map((model) => model.modelId)).toContain("puter-gpt-5");
  });

  it("detects realtime/web orchestration intent from current-event prompts", () => {
    expect(detectCapabilityIntent("What is the weather today in Perth?")).toMatchObject({
      requiresWebAccess: true,
      orchestrationMode: "web-query",
    });
    expect(detectCapabilityIntent("Refactor this React component")).toMatchObject({
      requiresWebAccess: false,
      orchestrationMode: "standard-chat",
    });
  });

  it("detects lightweight tool and media orchestration intent without creating agents", () => {
    expect(detectCapabilityIntent("Use a tool to inspect this JSON shape")).toMatchObject({
      requiredCapabilities: ["streaming", "tools"],
      orchestrationMode: "tool-eligible",
    });
    expect(detectCapabilityIntent("Generate an image of the dashboard state")).toMatchObject({
      requiredCapabilities: ["imageGeneration"],
      orchestrationMode: "media-generation",
    });
    expect(detectCapabilityIntent("Transcribe this voice memo")).toMatchObject({
      requiredCapabilities: ["speechToText"],
      orchestrationMode: "voice",
    });
  });
});
