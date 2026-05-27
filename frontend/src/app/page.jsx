'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getTeamPoints } from '@/lib/api';
import { CHART_COLORS } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import { CardGridSkeleton, MetricSkeleton } from '@/components/ui/Skeleton';

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.fill || p.color }}>{p.value} pts</p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTeamPoints()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-5 pb-16">
        <HeroSection />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <MetricSkeleton /><MetricSkeleton /><MetricSkeleton />
        </div>
        <CardGridSkeleton />
      </div>
    );
  }

  const teamData = data?.teams?.map((t, i) => ({ name: t.TeamName, points: t.Points, fill: `hsl(${(i * 36) % 360}, 75%, 55%)` })) || [];
  const driverData = data?.drivers?.map((d, i) => ({ name: d.Abbreviation, points: d.Points, fill: CHART_COLORS[i % CHART_COLORS.length] })) || [];

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <HeroSection />

      {/* Stats Row */}
      <motion.div variants={stagger} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div variants={fadeUp}><MetricCard label="Grand Prix" value={data?.race || '—'} small /></motion.div>
        <motion.div variants={fadeUp}><MetricCard label="Teams" value={data?.teams?.length || 0} /></motion.div>
        <motion.div variants={fadeUp}><MetricCard label="Classified Drivers" value={data?.drivers?.length || 0} /></motion.div>
      </motion.div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard accent>
          <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Constructor Points</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis type="number" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9a9ab0', fontSize: 11 }} width={100} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="points" radius={[0, 6, 6, 0]} animationDuration={1200}>
                  {teamData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard accent>
          <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Top 10 Drivers</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={driverData} margin={{ bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="points" radius={[6, 6, 0, 0]} animationDuration={1200}>
                  {driverData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <header className="relative text-center py-14 overflow-hidden mb-6">
      {/* Glow */}
      <div className="absolute top-[-60px] left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
           style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(225,6,0,0.18) 0%, transparent 65%)', filter: 'blur(50px)', animation: 'pulseGlow 5s ease-in-out infinite alternate' }} />

      {/* Speed Lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[20, 40, 60, 75, 10].map((top, i) => (
          <span key={i} className="speed-line absolute" style={{ top: `${top}%`, width: `${150 + i * 40}px`, animationDelay: `${i * 0.8}s` }} />
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="inline-block px-4 py-1 border-2 border-[#e10600] rounded text-[0.65rem] font-bold tracking-[4px] text-[#e10600] uppercase mb-3">
          DATA DRIVEN
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-5xl md:text-7xl font-black uppercase tracking-tight"
        style={{ fontFamily: 'var(--font-titillium)' }}
      >
        F1 <span className="gradient-text">Data Lab</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-sm text-[#9a9ab0] mt-2 tracking-wide uppercase"
      >
        Race Analytics · Telemetry · ML Predictions · AI Engineer
      </motion.p>
    </header>
  );
}
