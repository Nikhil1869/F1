'use client';

export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = "font-semibold uppercase tracking-wide rounded-md transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  const variants = {
    primary: 'bg-[#e10600] text-white border-none shadow-[0_4px_16px_rgba(225,6,0,0.35)] hover:bg-[#b80500] hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(225,6,0,0.35)] active:scale-[0.97]',
    outline: 'bg-transparent text-[#e10600] border-2 border-[#e10600] hover:bg-[rgba(225,6,0,0.12)] hover:-translate-y-0.5',
    ghost: 'bg-transparent text-[#9a9ab0] border border-white/[0.08] hover:text-white hover:border-[#e10600] hover:bg-[rgba(30,30,48,0.7)]',
  };

  const sizes = {
    sm: 'text-xs px-4 py-2',
    md: 'text-sm px-6 py-2.5',
    lg: 'text-base px-9 py-3.5',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={{ fontFamily: 'var(--font-titillium)' }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Select({ children, className = '', ...props }) {
  return (
    <select
      className={`
        bg-[#12121e] text-[#f0f0f5] border border-white/[0.08] rounded-md
        px-3 py-2 text-sm font-semibold cursor-pointer
        transition-all duration-200
        hover:border-[#e10600] focus:border-[#e10600] focus:outline-none
        ${className}
      `}
      style={{ fontFamily: 'var(--font-outfit)' }}
      {...props}
    >
      {children}
    </select>
  );
}
