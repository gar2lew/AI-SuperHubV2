import { beforeEach, describe, expect, it } from "vitest";
import {
  getResourceSnapshot,
  resetResourceTrackerForTests,
  trackMediaTrackAcquired,
  trackMediaTrackReleased,
  trackObjectUrlCreated,
  trackObjectUrlRevoked,
} from "@/lib/diagnostics/resourceTracker";

describe("resourceTracker", () => {
  beforeEach(() => {
    resetResourceTrackerForTests();
  });

  it("keeps object URL and media track counters bounded through repeated cleanup", () => {
    trackObjectUrlCreated("blob:image-a");
    trackObjectUrlCreated("blob:image-b");
    trackObjectUrlRevoked("blob:image-a");
    trackObjectUrlRevoked("blob:image-b");
    trackObjectUrlRevoked("blob:image-b");

    trackMediaTrackAcquired(2);
    trackMediaTrackReleased(1);
    trackMediaTrackReleased(5);

    expect(getResourceSnapshot()).toMatchObject({
      activeObjectUrlCount: 0,
      createdObjectUrlCount: 2,
      revokedObjectUrlCount: 2,
      activeMediaTrackCount: 0,
      acquiredMediaTrackCount: 2,
      releasedMediaTrackCount: 2,
    });
  });
});
