import { Skeleton } from '@/components/ui/Skeleton';
export default function Loading() {
  return <div className="max-w-4xl mx-auto px-5 pb-16"><div className="skeleton h-8 w-48 mb-6" /><div className="glass rounded-[14px] p-6 h-[520px]"><div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-3/4" /><Skeleton className="h-16 w-full" /></div></div></div>;
}
