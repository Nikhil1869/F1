'use client';

export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`skeleton rounded-md ${className}`}
      {...props}
    />
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass rounded-[14px] p-6">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-[280px] w-full" />
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="glass rounded-[14px] p-7 text-center">
      <Skeleton className="h-3 w-20 mx-auto mb-3" />
      <Skeleton className="h-10 w-24 mx-auto" />
    </div>
  );
}

export function CardGridSkeleton({ count = 2 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {Array.from({ length: count }).map((_, i) => (
        <ChartSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="w-7 h-7 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-28 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </div>
  );
}
