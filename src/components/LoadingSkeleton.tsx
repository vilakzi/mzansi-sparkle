import { Skeleton } from '@/components/ui/skeleton';

export const FeedLoadingSkeleton = () => {
  return (
    <div className="h-[calc(100vh-4rem)] bg-black relative overflow-hidden">
      {/* Center shimmer placeholder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/10" />
          <div className="w-32 h-2 rounded bg-white/10" />
        </div>
      </div>
      
      {/* Right side action bar skeleton */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5">
        <Skeleton className="h-12 w-12 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
        <Skeleton className="h-10 w-10 rounded-full bg-white/10" />
      </div>
      
      {/* Bottom info skeleton */}
      <div className="absolute bottom-0 left-0 right-20 p-4 pb-5">
        <Skeleton className="h-1 w-full rounded bg-white/10 mb-3" />
        <Skeleton className="h-4 w-24 rounded bg-white/10 mb-2" />
        <Skeleton className="h-3 w-48 rounded bg-white/10" />
      </div>
    </div>
  );
};

export const ProfileLoadingSkeleton = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 px-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  );
};

export const PostDetailLoadingSkeleton = () => {
  return (
    <div className="space-y-4">
      <Skeleton className="w-full aspect-[9/16]" />
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// CategoryLoadingSkeleton removed - not in use (category backend not implemented)
