'use client';

export default function PageHeader({ title, gradient, subtitle }) {
  return (
    <div className="mb-6 pb-4 border-b-[3px] border-[#e10600] relative">
      <div className="absolute bottom-[-3px] left-0 w-[60px] h-[3px] bg-white" />
      <h2 className="text-2xl font-bold uppercase tracking-wide" style={{ fontFamily: 'var(--font-titillium)' }}>
        {title} <span className="gradient-text">{gradient}</span>
      </h2>
      {subtitle && (
        <p className="text-[#9a9ab0] mt-1 text-sm font-normal">{subtitle}</p>
      )}
    </div>
  );
}
