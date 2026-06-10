'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getTelemetry } from '@/lib/api';
import { DRIVERS, F1_RED, CYAN } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Button';
import { CardGridSkeleton } from '@/components/ui/Skeleton';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          <span className="font-bold">{p.dataKey}</span>: {Number(p.value).toFixed(1)}
        </p>
      ))}
    </div>
  );
}

export default function TelemetryPage() {
  const [d1, setD1] = useState('VER');
  const [d2, setD2] = useState('LEC');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getTelemetry(d1, d2);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const buildChartData = (key) => {
    if (!data) return [];
    const tel1 = data.tel1;
    const tel2 = data.tel2;
    const points = [];
    const len = Math.max(tel1.distance.length, tel2.distance.length);
    for (let i = 0; i < len; i++) {
      points.push({
        dist: tel1.distance[i] || tel2.distance[i] || 0,
        [data.d1]: tel1[key]?.[i] ?? null,
        [data.d2]: tel2[key]?.[i] ?? null,
      });
    }
    return points;
  };

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Part 2 —" gradient="FastF1 Telemetry" subtitle="Qualifying lap comparison — Speed, Throttle & Brake traces" />

      {/* Driver Selector */}
      <GlassCard className="mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Driver 1:
            <Select value={d1} onChange={(e) => setD1(e.target.value)}>
              {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </label>
          <span className="text-xl font-black text-[#e10600] tracking-[3px]">VS</span>
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Driver 2:
            <Select value={d2} onChange={(e) => setD2(e.target.value)}>
              {DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </label>
          <Button onClick={load} disabled={loading}>
            {loading ? '⏳ Loading...' : 'Load Telemetry'}
          </Button>
        </div>
      </GlassCard>

      {loading && <CardGridSkeleton count={3} />}

      {data && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          {/* Speed Chart */}
          <GlassCard accent className="mb-4">
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Speed Trace (km/h)</h3>
            <div className="w-full min-w-[200px] min-h-[100px] h-[360px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={buildChartData('speed')}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="dist" tick={{ fill: '#9a9ab0', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
                  <YAxis tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey={data.d1} stroke={F1_RED} dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey={data.d2} stroke={CYAN} dot={false} strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Throttle & Brake */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Throttle %</h3>
              <div className="w-full min-w-[200px] min-h-[100px] h-[280px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={buildChartData('throttle')}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="dist" tick={{ fill: '#9a9ab0', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
                    <YAxis tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey={data.d1} stroke={F1_RED} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey={data.d2} stroke={CYAN} dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Brake Input</h3>
              <div className="w-full min-w-[200px] min-h-[100px] h-[280px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={buildChartData('brake')}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="dist" tick={{ fill: '#9a9ab0', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`} />
                    <YAxis tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey={data.d1} stroke={F1_RED} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey={data.d2} stroke={CYAN} dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>
        </motion.div>
      )}
    </div>
  );
}
