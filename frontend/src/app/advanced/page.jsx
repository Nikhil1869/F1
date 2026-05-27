'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { predictAdvanced, simulateSeason } from '@/lib/api';
import { F1_RED, CYAN, PURPLE, ORANGE, GREEN } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import PredictionsList from '@/components/ui/PredictionsList';
import { Button } from '@/components/ui/Button';
import { CardGridSkeleton, MetricSkeleton, ListSkeleton } from '@/components/ui/Skeleton';

const PIE_COLORS = [F1_RED, CYAN, PURPLE, ORANGE, GREEN];

export default function AdvancedPage() {
  const [data, setData] = useState(null);
  const [simData, setSimData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simLoading, setSimLoading] = useState(false);

  const runAdvanced = async () => {
    setLoading(true);
    try { setData(await predictAdvanced()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const runSim = async () => {
    setSimLoading(true);
    try { setSimData(await simulateSeason()); }
    catch (e) { console.error(e); }
    finally { setSimLoading(false); }
  };

  const featureData = data?.featureImportances
    ? Object.entries(data.featureImportances).map(([name, value]) => ({ name, value: +value.toFixed(3) }))
    : [];

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Part 4 —" gradient="Improved ML Model" subtitle="Feature engineering (DriverForm) + GridSearchCV hyperparameter tuning" />

      <div className="flex gap-3 mb-5 flex-wrap">
        <Button size="lg" onClick={runAdvanced} disabled={loading}>
          {loading ? '⏳ Tuning...' : '🧠 Run Advanced Model'}
        </Button>
        <Button size="lg" variant="outline" onClick={runSim} disabled={simLoading}>
          {simLoading ? '⏳ Simulating...' : '🔮 Simulate Rest of Season'}
        </Button>
      </div>

      {loading && (<><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></div><CardGridSkeleton /></>)}

      {data && !loading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <MetricCard label="Accuracy" value={data.accuracy * 100} suffix="%" />
            <MetricCard label="Best Params" value={JSON.stringify(data.bestParams)} small />
            <MetricCard label="Data Points" value={data.dataPoints} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Feature Importances</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={featureData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}>
                    {featureData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie><Tooltip /><Legend iconType="circle" /></PieChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Podium Predictions</h3>
              <PredictionsList predictions={data.predictions} showForm />
            </GlassCard>
          </div>
        </motion.div>
      )}

      {simLoading && <div className="mt-8"><GlassCard><ListSkeleton rows={10} /></GlassCard></div>}

      {simData && !simLoading && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
          <h3 className="text-lg font-bold mb-4 pb-2 border-b border-white/[0.08]">Predicted 2026 Final Standings</h3>
          <GlassCard accent className="mb-6">
            <div className="max-h-[400px] overflow-y-auto">
              {simData.finalStandings?.map((drv, i) => {
                const rc = i === 0 ? 'pred-rank-gold' : i === 1 ? 'pred-rank-silver' : i === 2 ? 'pred-rank-bronze' : 'text-[#e10600]';
                return (
                  <motion.div key={drv.driver} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 py-3 border-b border-white/[0.06] last:border-0">
                    <div className={`text-lg font-black w-7 text-center ${rc}`}>{drv.rank}</div>
                    <div className="flex-1"><div className="font-bold text-sm uppercase">{drv.driver}</div><div className="text-[0.7rem] text-[#5e5e75] uppercase">{drv.team}</div></div>
                    <div className="font-bold text-base tabular-nums">{drv.points} pts</div>
                  </motion.div>
                );
              })}
            </div>
          </GlassCard>

          <h3 className="text-lg font-bold mb-4 pb-2 border-b border-white/[0.08]">Predicted Podiums for Remaining Races</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {simData.racePredictions?.map((race) => (
              <GlassCard key={race.eventName} accent>
                <h4 className="font-bold text-sm mb-3">{race.eventName}</h4>
                {race.podium.map((p, idx) => {
                  const rc = idx === 0 ? 'pred-rank-gold' : idx === 1 ? 'pred-rank-silver' : 'pred-rank-bronze';
                  return (
                    <div key={idx} className="flex items-center gap-2 py-1.5">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${rc}`}>{idx + 1}</div>
                      <span className="text-sm">{p}</span>
                    </div>
                  );
                })}
              </GlassCard>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
