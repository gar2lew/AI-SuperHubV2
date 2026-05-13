import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIChunk, ContentPart } from "@/types";
import {
  chunksToReasoning,
  chunksToText,
  copyMessageContent,
  extractFiles,
  extractImages,
  extractText,
  finalizeChunks,
  findLast,
  formatDate,
  formatTimestamp,
  generateId,
  hasToolCalls,
  isMultimodal,
  messageToTitle,
  textContent,
  truncate,
} from "@/lib/utils";

describe("utility functions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T08:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.25);
  });

  it("handles ids, dates, timestamps, truncation, and last matching item", () => {
    expect(generateId()).toBe("mp3rri80-9");
    expect(formatTimestamp(Date.parse("2026-05-13T07:05:00.000Z"))).toMatch(/\d{1,2}:05/);
    expect(formatDate(Date.parse("2026-05-13T01:00:00.000Z"))).toBe("Today");
    expect(formatDate(Date.parse("2026-05-12T01:00:00.000Z"))).toBe("Yesterday");
    expect(truncate("abcdefghij", 8)).toBe("abcde...");
    expect(findLast([1, 2, 3, 4], (item) => item % 2 === 0)).toBe(4);
  });

  it("extracts and classifies multimodal content", () => {
    const content: ContentPart[] = [
      { type: "text", text: "Hello" },
      { type: "image", url: "blob:image", mimeType: "image/png" },
      { type: "file", url: "blob:file", name: "notes.md", mimeType: "text/markdown" },
    ];

    expect(textContent("x")).toEqual([{ type: "text", text: "x" }]);
    expect(extractText(content)).toBe("Hello");
    expect(isMultimodal(content)).toBe(true);
    expect(extractImages(content)).toEqual([{ type: "image", url: "blob:image", mimeType: "image/png" }]);
    expect(extractFiles(content)).toEqual([
      { type: "file", url: "blob:file", name: "notes.md", mimeType: "text/markdown" },
    ]);
    expect(messageToTitle([{ type: "text", text: "# Hello   `world`" }])).toBe("Hello world");
    expect(messageToTitle([])).toBe("New Conversation");
  });

  it("summarizes streaming chunks for display and final messages", () => {
    const chunks: AIChunk[] = [
      { type: "reasoning", content: "think " },
      { type: "text", content: "hello" },
      { type: "tool_call", content: "call", metadata: { toolId: "search" } },
      { type: "text", content: " world" },
      { type: "reasoning", content: "done" },
    ];

    expect(chunksToText(chunks)).toBe("hello world");
    expect(chunksToReasoning(chunks)).toBe("think done");
    expect(hasToolCalls(chunks)).toBe(true);
    expect(finalizeChunks(chunks)).toEqual([{ type: "text", text: "hello world" }]);
  });

  it("copies extracted text content to the clipboard", async () => {
    await copyMessageContent([{ type: "text", text: "copy me" }]);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copy me");
  });
});
