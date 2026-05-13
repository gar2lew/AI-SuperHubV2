export function WorkspaceLoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6" role="status" aria-live="polite" aria-label="Loading workspace">
      <div className="h-6 w-44 animate-pulse rounded bg-bg-tertiary" />
      <div className="h-20 animate-pulse rounded bg-bg-tertiary" />
      <div className="h-20 animate-pulse rounded bg-bg-tertiary" />
      <div className="h-20 animate-pulse rounded bg-bg-tertiary" />
    </div>
  );
}
