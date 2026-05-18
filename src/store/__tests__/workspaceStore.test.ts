import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeHydratedWorkspaceState, useWorkspaceStore } from "@/store/workspaceStore";

function resetWorkspaceStore() {
  useWorkspaceStore.setState({
    workspaces: [],
    activeWorkspaceId: null,
  });
  useWorkspaceStore.persist.clearStorage();
}

describe("workspaceStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T03:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    resetWorkspaceStore();
  });

  it("creates a default workspace and preserves workspace-scoped preferences", () => {
    const id = useWorkspaceStore.getState().createWorkspace("Personal OS");
    useWorkspaceStore.getState().updateWorkspace(id, {
      intent: "personal-ai-os",
      category: "operations",
      tags: ["continuity", "workspace"],
      description: "Persistent personal-use AI workspace",
      summary: "Use this workspace for durable planning context.",
      preferences: {
        providerId: "puter",
        modelId: "puter-gpt-5",
        autoInjectPinnedContext: true,
      },
    });

    expect(useWorkspaceStore.getState().getActiveWorkspace()).toMatchObject({
      id,
      name: "Personal OS",
      intent: "personal-ai-os",
      category: "operations",
      tags: ["continuity", "workspace"],
      description: "Persistent personal-use AI workspace",
      summary: "Use this workspace for durable planning context.",
      preferences: {
        providerId: "puter",
        modelId: "puter-gpt-5",
        autoInjectPinnedContext: true,
      },
    });
  });

  it("sanitizes stale active workspace ids and disabled pinned context blocks", () => {
    const repaired = sanitizeHydratedWorkspaceState({
      activeWorkspaceId: "missing-workspace",
      workspaces: [
        {
          id: "workspace-1",
          name: "Recovered",
          tags: [" durable ", "", "context"],
          pinnedContext: [
            {
              id: "block-1",
              title: "Always include",
              content: "Remember project constraints.",
              enabled: true,
              priority: 3,
              createdAt: 1,
              updatedAt: 1,
            },
            {
              id: "block-2",
              title: "Disabled",
              content: "Do not inject.",
              enabled: false,
              priority: 2,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          preferences: { autoInjectPinnedContext: true },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    expect(repaired.activeWorkspaceId).toBe("workspace-1");
    expect(repaired.workspaces?.[0].tags).toEqual(["durable", "context"]);
    expect(repaired.workspaces?.[0].preferences.autoInjectPinnedContext).toBe(true);
    expect(repaired.workspaces?.[0].pinnedContext).toHaveLength(2);
  });

  it("builds an ordered injectable pinned context summary for the active workspace", () => {
    const id = useWorkspaceStore.getState().createWorkspace("Continuity");
    useWorkspaceStore.getState().updateWorkspace(id, {
      summary: "Stable personal AI workspace.",
    });
    useWorkspaceStore.getState().upsertPinnedContext(id, {
      title: "Constraints",
      content: "Do not build autonomous agents.",
      enabled: true,
      priority: 5,
    });
    useWorkspaceStore.getState().upsertPinnedContext(id, {
      title: "Notes",
      content: "Prefer lightweight retrieval helpers.",
      enabled: true,
      priority: 1,
    });

    const context = useWorkspaceStore.getState().getInjectableContext(id);
    expect(context).toContain("Workspace: Continuity");
    expect(context).toContain("Stable personal AI workspace.");
    expect(context.indexOf("Constraints")).toBeLessThan(context.indexOf("Notes"));
    expect(context).toContain("[priority 5] Constraints");
  });
});
