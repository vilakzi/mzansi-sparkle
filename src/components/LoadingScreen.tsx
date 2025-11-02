import { Skeleton } from "@/components/ui/skeleton";

export const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="relative w-full max-w-md h-screen">
        {/* Video skeleton */}
        <Skeleton className="h-full w-full rounded-none" />
        
        {/* Bottom content skeleton */}
        <div className="absolute bottom-24 left-0 right-0 px-6 space-y-4">
          {/* Avatar */}
          <Skeleton className="h-12 w-12 rounded-full" />
          
          {/* Username */}
          <Skeleton className="h-6 w-32" />
          
          {/* Caption */}
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          
          {/* Action buttons */}
          <div className="flex gap-4 mt-4">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>
        
        {/* Side action buttons */}
        <div className="absolute right-4 bottom-32 space-y-6">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
};
