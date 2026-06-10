'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getSeasonStandings } from '@/lib/api';
import { CHART_COLORS } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Button';
import { CardGridSkeleton, MetricSkeleton } from '@/components/ui/Skeleton';

export default function SeasonPage() {
  const [year, setYear] = useState('2024');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await getSeasonStandings(year)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const buildProgressionData = (progression, rounds) => {
    if (!progression || !rounds) return [];
    return rounds.map((round, i) => {
      const point = { round };
      for (const [driver, values] of Object.entries(progression)) {
        point[driver] = values[i] ?? 0;
      }
      return point;
    });
  };

  const driverChartData = data ? buildProgressionData(data.driverProgression, data.rounds) : [];
  const teamChartData = data ? buildProgressionData(data.teamProgression, data.rounds) : [];
  const driverKeys = data ? Object.keys(data.driverProgression || {}) : [];
  const teamKeys = data ? Object.keys(data.teamProgression || {}) : [];

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Season —" gradient="Leaderboard Dashboard" subtitle="Driver & constructor championship progression across the full season" />

      <GlassCard className="mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Season:
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </Select>
          </label>
          <Button onClick={load} disabled={loading}>
            {loading ? '⏳ Loading...' : 'Load Season Data'}
          </Button>
        </div>
      </GlassCard>

      {loading && (<><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div><CardGridSkeleton /></>)}

      {data && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <MetricCard label="Races Loaded" value={data.racesLoaded} />
            <MetricCard label="Championship Leader" value={data.leader} small />
            <MetricCard label="Total Drivers" value={data.totalDrivers} />
          </div>

          <GlassCard accent className="mb-4">
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Driver Championship Progression</h3>
            <div className="w-full min-w-[200px] min-h-[100px] h-[360px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={driverChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="round" tick={{ fill: '#9a9ab0', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {driverKeys.map((d, i) => (
                    <Line key={d} type="monotone" dataKey={d} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard accent>
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Constructor Championship Progression</h3>
            <div className="w-full min-w-[200px] min-h-[100px] h-[360px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={teamChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="round" tick={{ fill: '#9a9ab0', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {teamKeys.map((t, i) => (
                    <Line key={t} type="monotone" dataKey={t} stroke={CHART_COLORS[i % CHART_COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
