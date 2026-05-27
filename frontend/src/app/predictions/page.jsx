'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getUpcomingRaces, predict } from '@/lib/api';
import { F1_RED, CYAN, PURPLE, ORANGE, GREEN } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import PredictionsList from '@/components/ui/PredictionsList';
import { Button, Select } from '@/components/ui/Button';
import { CardGridSkeleton, MetricSkeleton } from '@/components/ui/Skeleton';

const PIE_COLORS = [F1_RED, CYAN, PURPLE, ORANGE, GREEN];

export default function PredictionsPage() {
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getUpcomingRaces().then((res) => {
      setRaces(res.races || []);
      if (res.races?.length) setSelectedRace(res.races[0]);
    }).catch(console.error);
  }, []);

  const run = async () => {
    setLoading(true);
    try { setData(await predict(selectedRace)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const featureData = data?.featureImportances
    ? Object.entries(data.featureImportances).map(([name, value]) => ({ name, value: +value.toFixed(3) }))
    : [];

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Part 3 —" gradient="Predict The Winner" subtitle="Dynamic ML model trained on track-specific history (1950-2026)" />
      <GlassCard className="mb-5">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Select Upcoming Race:
            <Select value={selectedRace} onChange={(e) => setSelectedRace(e.target.value)}>
              {races.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </label>
          <Button size="lg" onClick={run} disabled={loading || !selectedRace}>
            {loading ? '⏳ Training model...' : '🚀 Predict Winner'}
          </Button>
        </div>
      </GlassCard>
      {loading && (<><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div><CardGridSkeleton /></>)}
      {data && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <MetricCard label="Accuracy" value={data.accuracy * 100} suffix="%" />
            <MetricCard label="Model" value={data.model} small />
            <MetricCard label="Data Points" value={data.dataPoints} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Feature Importances</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={featureData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} animationDuration={1200}>
                    {featureData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie><Tooltip /><Legend iconType="circle" /></PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Podium Predictions</h3>
              <PredictionsList predictions={data.predictions} />
            </GlassCard>
          </div>
        </motion.div>
      )}
    </div>
  );
}
