interface ResourceSnapshot {
  activeObjectUrlCount: number;
  createdObjectUrlCount: number;
  revokedObjectUrlCount: number;
  activeMediaTrackCount: number;
  acquiredMediaTrackCount: number;
  releasedMediaTrackCount: number;
}

const activeObjectUrls = new Set<string>();
const snapshot: ResourceSnapshot = {
  activeObjectUrlCount: 0,
  createdObjectUrlCount: 0,
  revokedObjectUrlCount: 0,
  activeMediaTrackCount: 0,
  acquiredMediaTrackCount: 0,
  releasedMediaTrackCount: 0,
};

export function trackObjectUrlCreated(url?: string | null) {
  if (!url?.startsWith('blob:') || activeObjectUrls.has(url)) return;
  activeObjectUrls.add(url);
  snapshot.createdObjectUrlCount += 1;
  snapshot.activeObjectUrlCount = activeObjectUrls.size;
}

export function trackObjectUrlRevoked(url?: string | null) {
  if (!url?.startsWith('blob:') || !activeObjectUrls.delete(url)) return;
  snapshot.revokedObjectUrlCount += 1;
  snapshot.activeObjectUrlCount = activeObjectUrls.size;
}

export function trackMediaTrackAcquired(count = 1) {
  const normalized = Math.max(0, count);
  snapshot.acquiredMediaTrackCount += normalized;
  snapshot.activeMediaTrackCount += normalized;
}

export function trackMediaTrackReleased(count = 1) {
  const normalized = Math.min(Math.max(0, count), snapshot.activeMediaTrackCount);
  snapshot.releasedMediaTrackCount += normalized;
  snapshot.activeMediaTrackCount -= normalized;
}

export function getResourceSnapshot(): ResourceSnapshot {
  return { ...snapshot };
}

export function resetResourceTrackerForTests() {
  activeObjectUrls.clear();
  Object.assign(snapshot, {
    activeObjectUrlCount: 0,
    createdObjectUrlCount: 0,
    revokedObjectUrlCount: 0,
    activeMediaTrackCount: 0,
    acquiredMediaTrackCount: 0,
    releasedMediaTrackCount: 0,
  } satisfies ResourceSnapshot);
}
