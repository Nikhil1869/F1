'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

function AnimatedNumber({ value, decimals = 0 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const target = parseFloat(value) || 0;
    const duration = 800;
    const start = performance.now();
    const from = 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    }

    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [value]);

  return <>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</>;
}

export default function MetricCard({ label, value, suffix = '', small = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="glass rounded-[14px] p-7 text-center relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#e10600]" />
      <div className="text-[0.65rem] font-bold text-[#5e5e75] uppercase tracking-[2px] mb-2">
        {label}
      </div>
      <div className={`font-black ${small ? 'text-base font-semibold text-[#f0f0f5]' : 'text-[2.6rem] text-[#e10600]'}`}>
        {typeof value === 'number' ? (
          <>
            <AnimatedNumber value={value} decimals={suffix === '%' ? 1 : 0} />
            {suffix}
          </>
        ) : (
          <span className={small ? '' : ''}>{value}{suffix}</span>
        )}
      </div>
    </motion.div>
  );
}
