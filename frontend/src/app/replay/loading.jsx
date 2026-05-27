export default function Loading() {
  return (
    <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0a0a12]">
      <div className="flex flex-col items-center gap-5">
        <div className="w-12 h-12 border-4 border-white/[0.08] border-t-[#e10600] rounded-full" style={{ animation: 'spin 0.7s linear infinite' }} />
        <p className="text-sm text-[#9a9ab0] uppercase tracking-wide font-semibold">Loading replay...</p>
      </div>
    </div>
  );
}
