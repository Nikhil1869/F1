'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from 'recharts';
import { getLaptimeRaces, analyzeLaptimes } from '@/lib/api';
import { CHART_COLORS } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Button';
import { CardGridSkeleton } from '@/components/ui/Skeleton';

export default function LaptimesPage() {
  const [year, setYear] = useState('2024');
  const [events, setEvents] = useState([]);
  const [round, setRound] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDrivers, setSelectedDrivers] = useState(new Set());

  useEffect(() => {
    getLaptimeRaces(year).then(res => {
      setEvents(res.events || []);
      if (res.events?.length > 0) setRound(res.events[0].round);
    }).catch(console.error);
  }, [year]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await analyzeLaptimes(year, round);
      setData(res);
      // Preselect top 5 drivers
      const initial = new Set();
      res.drivers?.slice(0, 5).forEach(d => initial.add(d.driver));
      setSelectedDrivers(initial);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDriver = (drv) => {
    const next = new Set(selectedDrivers);
    if (next.has(drv)) next.delete(drv);
    else next.add(drv);
    setSelectedDrivers(next);
  };

  const getCompoundColors = () => data?.compoundColors || {
    SOFT: '#e10600', MEDIUM: '#ffc906', HARD: '#f0f0f0',
    INTERMEDIATE: '#43b02a', WET: '#0072c6', UNKNOWN: '#888'
  };

  const lapScatterData = [];
  if (data) {
    let colorIdx = 0;
    Array.from(selectedDrivers).forEach(drv => {
      const laps = data.driverLaps[drv];
      if (!laps) return;
      const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
      lapScatterData.push({
        drv,
        color,
        data: laps.map(l => ({ lap: l.lap, time: l.time, compound: l.compound, drv }))
      });
      colorIdx++;
    });
  }

  const compStats = data?.compoundStats || {};
  const compBarData = Object.keys(compStats).map(c => ({
    name: c,
    avg: compStats[c].avg,
    fill: compStats[c].color || '#888'
  }));

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Lap Times —" gradient="Race Analysis" subtitle="Stint degradation, lap time distributions, and fastest laps" />

      <GlassCard className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Year:
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </Select>
          </label>
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Race:
            <Select value={round} onChange={(e) => setRound(e.target.value)}>
              {events.map(ev => <option key={ev.round} value={ev.round}>R{ev.round} — {ev.name}</option>)}
            </Select>
          </label>
          <Button onClick={load} disabled={loading || events.length === 0}>
            {loading ? '⏳ Analyzing...' : '⏱️ Analyze'}
          </Button>
        </div>
      </GlassCard>

      {loading && <CardGridSkeleton count={2} />}

      {data && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <GlassCard className="mb-6">
            <h3 className="text-[10px] font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-3">Select Drivers</h3>
            <div className="flex flex-wrap gap-2">
              {data.drivers?.map(d => {
                const active = selectedDrivers.has(d.driver);
                return (
                  <button key={d.driver} onClick={() => toggleDriver(d.driver)}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition-all border ${
                      active ? 'bg-[#e10600]/20 border-[#e10600] text-white' : 'bg-white/[0.02] border-white/[0.05] text-[#9a9ab0] hover:bg-white/[0.06]'
                    }`}>
                    {d.driver}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard accent className="mb-6">
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Lap Times by Driver & Compound</h3>
            <div className="w-full min-w-[200px] min-h-[100px] h-[400px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <ScatterChart margin={{ bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" dataKey="lap" name="Lap" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                  <YAxis type="number" dataKey="time" name="Time (s)" tick={{ fill: '#9a9ab0', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} 
                           contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                           formatter={(val, name, props) => [`${val.toFixed(3)}s (${props.payload.compound})`, props.payload.drv]} />
                  <Legend />
                  {lapScatterData.map((s) => (
                    <Scatter key={s.drv} name={s.drv} data={s.data} fill={s.color} shape="circle" line={{ strokeWidth: 1.5 }} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Average Pace by Compound</h3>
              <div className="w-full min-w-[200px] min-h-[100px] h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={compBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="name" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9a9ab0', fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {compBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">⚡ Fastest Laps</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {data.fastestLaps?.map((lap, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                        lap.rank === 1 ? 'bg-[#e0b04a] text-black' : lap.rank === 2 ? 'bg-[#b0b0b0] text-black' : lap.rank === 3 ? 'bg-[#cd7f32] text-black' : 'bg-white/10'
                      }`}>
                        {lap.rank}
                      </div>
                      <div>
                        <div className="font-bold text-white">{lap.driver}</div>
                        <div className="text-[10px] text-[#9a9ab0] uppercase tracking-wide flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: getCompoundColors()[lap.compound] || '#888' }} />
                          {lap.compound} · Lap {lap.lap}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-[#00d2ff] font-bold">{lap.timeFormatted}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </motion.div>
      )}
    </div>
  );
}
