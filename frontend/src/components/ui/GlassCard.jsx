'use client';

import { motion } from 'framer-motion';

export default function GlassCard({ children, className = '', hover = true, accent = false, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className={`
        relative overflow-hidden rounded-[14px] p-6
        bg-[rgba(20,20,35,0.6)] backdrop-blur-[20px]
        border border-white/[0.08]
        shadow-[0_4px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]
        transition-all duration-300
        ${hover ? 'hover:border-white/[0.15] hover:-translate-y-0.5 hover:shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]' : ''}
        ${className}
      `}
      {...props}
    >
      {/* Top accent line */}
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#e10600]" />
      )}
      {/* Glass sheen overlay */}
      <div className="absolute inset-0 rounded-[14px] pointer-events-none"
           style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%, rgba(255,255,255,0.01) 100%)' }} />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
