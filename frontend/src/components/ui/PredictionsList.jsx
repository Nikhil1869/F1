'use client';

import { motion } from 'framer-motion';

export default function PredictionsList({ predictions = [], showForm = false }) {
  if (!predictions.length) return null;

  return (
    <div className="max-h-[340px] overflow-y-auto">
      {predictions.map((p, i) => {
        const rankClass = i === 0 ? 'pred-rank-gold' : i === 1 ? 'pred-rank-silver' : i === 2 ? 'pred-rank-bronze' : 'text-[#e10600]';
        const formText = showForm && p.form !== undefined ? ` · Form: ${p.form} pts` : '';

        return (
          <motion.div
            key={p.driver}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3.5 py-3 border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.02] hover:pl-1.5 transition-all"
          >
            <div className={`text-lg font-black w-7 text-center ${rankClass}`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm uppercase truncate">{p.driver}</div>
              <div className="text-[0.7rem] text-[#5e5e75] uppercase tracking-wide truncate">
                {p.team}{formText}
              </div>
            </div>
            <div className="font-bold text-base text-[#00e676] tabular-nums">
              {(p.podiumProb * 100).toFixed(0)}%
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
