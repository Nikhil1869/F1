import { CardGridSkeleton, MetricSkeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-5 pb-16 pt-20">
      <div className="skeleton h-8 w-48 mb-2" />
      <div className="skeleton h-4 w-72 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <MetricSkeleton /><MetricSkeleton /><MetricSkeleton />
      </div>
      <CardGridSkeleton />
    </div>
  );
}
