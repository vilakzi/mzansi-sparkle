export const LoadingSkeleton = ({ count = 1 }: { count?: number }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-screen w-full snap-start snap-always bg-background animate-pulse"
        >
          {/* Video/Image skeleton */}
          <div className="w-full h-3/4 bg-muted" />

          {/* Stats section skeleton */}
          <div className="absolute bottom-0 left-0 right-0 p-6 pb-32 space-y-4">
            {/* Avatar skeleton */}
            <div className="h-12 w-12 rounded-full bg-muted" />

            {/* Caption skeleton */}
            <div className="space-y-2">
              <div className="h-4 bg-muted w-full" />
              <div className="h-4 bg-muted w-3/4" />
            </div>

            {/* Stats skeleton */}
            <div className="flex gap-6">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-1">
                  <div className="h-6 w-6 bg-muted rounded" />
                  <div className="h-4 w-8 bg-muted rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
