import { describe, expect, it } from "vitest";
import type { Conversation, WorkspaceMetadata } from "@/types";
import { searchConversations, searchWorkspaces } from "@/lib/retrieval/search-index";

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: "conversation",
    title: "Untitled",
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    presetId: "smart",
    providerId: "puter",
    modelId: "puter-gpt-5",
    ...overrides,
  };
}

function workspace(overrides: Partial<WorkspaceMetadata>): WorkspaceMetadata {
  return {
    id: "workspace",
    name: "Workspace",
    pinnedContext: [],
    preferences: { autoInjectPinnedContext: true },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("lightweight search index", () => {
  it("searches active conversations by title, summary, tags, and message text", () => {
    const results = searchConversations(
      [
        conversation({
          id: "alpha",
          title: "Deployment notes",
          summary: "Persistent AI workspace continuity",
          tags: ["ops"],
          messages: [
            {
              id: "m1",
              role: "user",
              content: [{ type: "text", text: "Need recovery semantics for streams" }],
              createdAt: 1,
            },
          ],
        }),
        conversation({
          id: "archived",
          title: "Old continuity notes",
          archivedAt: 2,
        }),
      ],
      "stream recovery continuity"
    );

    expect(results.map((result) => result.item.id)).toEqual(["alpha"]);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].matchedFields).toEqual(expect.arrayContaining(["summary", "messages"]));
  });

  it("can include archived conversations when explicitly requested", () => {
    const results = searchConversations(
      [conversation({ id: "archived", title: "Archived recovery plan", archivedAt: 2 })],
      "recovery",
      { includeArchived: true }
    );

    expect(results.map((result) => result.item.id)).toEqual(["archived"]);
  });

  it("searches workspace cognition metadata and pinned context", () => {
    const results = searchWorkspaces(
      [
        workspace({
          id: "personal",
          name: "Personal AI OS",
          intent: "persistent workspace cognition",
          category: "operations",
          tags: ["continuity", "context"],
          summary: "A dependable workspace for long-running work.",
          pinnedContext: [
            {
              id: "ctx",
              title: "Constraint",
              content: "No autonomous agents in this phase.",
              enabled: true,
              priority: 5,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      ],
      "cognition autonomous agents"
    );

    expect(results.map((result) => result.item.id)).toEqual(["personal"]);
    expect(results[0].matchedFields).toEqual(expect.arrayContaining(["intent", "pinnedContext"]));
  });
});
