import { CardGridSkeleton } from '@/components/ui/Skeleton';
export default function Loading() {
  return <div className="max-w-6xl mx-auto px-5 pb-16"><div className="skeleton h-8 w-48 mb-6" /><CardGridSkeleton count={4} /></div>;
}
