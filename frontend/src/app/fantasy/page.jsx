'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { getFantasyDrivers, simulateFantasy } from '@/lib/api';
import { F1_RED, CYAN } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { CardGridSkeleton, ListSkeleton } from '@/components/ui/Skeleton';

export default function FantasyPage() {
  const [drivers, setDrivers] = useState([]);
  const [picks, setPicks] = useState(new Set());
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [driversLoading, setDriversLoading] = useState(true);

  useEffect(() => {
    getFantasyDrivers().then((res) => setDrivers(res.drivers || [])).catch(console.error).finally(() => setDriversLoading(false));
  }, []);

  const toggleDriver = (drv) => {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(drv)) next.delete(drv);
      else if (next.size < 5) next.add(drv);
      return next;
    });
  };

  const simulate = async () => {
    setLoading(true);
    try { setResults(await simulateFantasy(Array.from(picks))); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const posColor = (pos) => pos <= 3 ? '#00e676' : pos <= 6 ? '#ffc906' : pos <= 10 ? '#ff8800' : '#e10600';

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Fantasy —" gradient="F1 Mini-Game" subtitle="Pick your 5 drivers and see how they score based on ML predictions" />

      {/* Draft Grid */}
      <GlassCard className="mb-5">
        <h3 className="text-sm font-bold uppercase mb-4">
          Draft Your Team <span className="font-normal text-[#9a9ab0]">(pick exactly 5 drivers)</span>
        </h3>
        {driversLoading ? <ListSkeleton rows={4} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-4">
            {drivers.map((d) => {
              const selected = picks.has(d.driver);
              return (
                <motion.div key={d.driver} whileTap={{ scale: 0.95 }} onClick={() => toggleDriver(d.driver)}
                  className={`relative p-3.5 rounded-[10px] text-center cursor-pointer transition-all duration-200 border ${
                    selected ? 'bg-[rgba(225,6,0,0.15)] border-[#e10600] shadow-[0_0_12px_rgba(225,6,0,0.3)]' : 'bg-[#12121e] border-white/[0.08] hover:border-white/[0.15]'}`}>
                  {selected && <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#e10600]" />}
                  <div className="font-bold text-sm">{d.driver}</div>
                  <div className="text-[0.65rem] text-[#5e5e75] uppercase">{d.team}</div>
                </motion.div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#9a9ab0]">Selected: {picks.size} / 5</span>
          <Button size="lg" onClick={simulate} disabled={picks.size !== 5 || loading}>
            {loading ? '⏳ Simulating...' : '🎲 Simulate Race'}
          </Button>
        </div>
      </GlassCard>

      {loading && <CardGridSkeleton count={3} />}

      {results && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <MetricCard label="Your Score" value={`${results.userScore} pts`} small />
            <MetricCard label="Best Possible" value={`${results.bestScore} pts`} small />
            <MetricCard label="Rating" value={results.rating} small />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Grid Position */}
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Your Team — Predicted Position</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={results.userTeam}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="driver" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                    <YAxis reversed domain={[1, 'auto']} tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="predictedPosition" radius={[6, 6, 0, 0]}>
                      {results.userTeam.map((d, i) => <Cell key={i} fill={posColor(d.predictedPosition)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            {/* Score Doughnut */}
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Score Breakdown</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'Your Score', value: results.userScore }, { name: 'Gap', value: Math.max(0, results.bestScore - results.userScore) }]}
                      dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                      <Cell fill={F1_RED} /><Cell fill="rgba(255,255,255,0.08)" />
                    </Pie>
                    <Tooltip /><motion.text />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          {/* Podium Probability */}
          <GlassCard accent className="mb-4">
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Top 10 — Podium Probability</h3>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(results.fullGrid || []).map((d) => ({ ...d, prob: +(d.podiumProb * 100).toFixed(1) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                  <YAxis type="category" dataKey="driver" tick={{ fill: '#9a9ab0', fontSize: 11 }} width={50} />
                  <Tooltip />
                  <Bar dataKey="prob" radius={[0, 4, 4, 0]}>
                    {(results.fullGrid || []).map((d, i) => <Cell key={i} fill={picks.has(d.driver) ? F1_RED : CYAN} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Team Results List */}
          <GlassCard accent>
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Your Team Results</h3>
            {results.userTeam.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0">
                <div className="text-lg font-black w-7 text-center text-[#e10600]">P{p.predictedPosition}</div>
                <div className="flex-1"><div className="font-bold text-sm uppercase">{p.driver}</div><div className="text-[0.7rem] text-[#5e5e75] uppercase">{p.team}</div></div>
                <div className="font-bold tabular-nums">{p.points} pts</div>
              </div>
            ))}
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
