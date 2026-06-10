'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getCalendar } from '@/lib/api';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Button';

function CountdownDisplay({ remaining }) {
  if (remaining <= 0) return <div className="text-4xl font-black text-white/50 tracking-widest mt-2">SESSION LIVE</div>;
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  
  const Unit = ({ val, lbl }) => (
    <div className="flex flex-col items-center">
      <span className="text-3xl md:text-5xl font-black text-white tabular-nums tracking-tighter" style={{ fontFamily: 'var(--font-titillium)' }}>
        {String(val).padStart(2, '0')}
      </span>
      <span className="text-[10px] text-[#9a9ab0] font-bold tracking-[2px]">{lbl}</span>
    </div>
  );

  return (
    <div className="flex items-start gap-4 mt-4">
      <Unit val={d} lbl="DAYS" /><span className="text-3xl font-black text-white/20 mt-1">:</span>
      <Unit val={h} lbl="HRS" /><span className="text-3xl font-black text-white/20 mt-1">:</span>
      <Unit val={m} lbl="MIN" /><span className="text-3xl font-black text-white/20 mt-1">:</span>
      <Unit val={s} lbl="SEC" />
    </div>
  );
}

export default function CalendarPage() {
  const [year, setYear] = useState('2024');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCalendar(year);
      setData(res);
      setCountdown(res.nextRace?.countdownSeconds || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => setCountdown(c => c - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [countdown]);

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Race —" gradient="Calendar" subtitle="Full season schedule with results and countdown" />

      <GlassCard className="mb-6">
        <div className="flex items-center gap-4">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Season:
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </Select>
          </label>
          <Button onClick={load} disabled={loading}>
            {loading ? '⏳ Loading...' : '📅 Load Calendar'}
          </Button>
        </div>
      </GlassCard>

      {data && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {data.nextRace && (
            <GlassCard className="mb-6 relative overflow-hidden flex flex-col items-center py-10">
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(225,6,0,0.15) 0%, transparent 70%)' }} />
              <div className="text-[10px] text-[#e10600] font-bold tracking-[4px] uppercase mb-1">NEXT RACE</div>
              <div className="text-3xl font-black text-white tracking-tight">{data.nextRace.flag} {data.nextRace.name}</div>
              <div className="text-sm text-[#9a9ab0] tracking-widest uppercase mt-1">{data.nextRace.date} · {data.nextRace.country}</div>
              <CountdownDisplay remaining={countdown} />
            </GlassCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <MetricCard label="Completed" value={data.completedRaces} />
            <MetricCard label="Remaining" value={data.totalRaces - data.completedRaces} />
            <MetricCard label="Total Races" value={data.totalRaces} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.races.map((race, i) => (
              <GlassCard key={i} className={`flex flex-col relative overflow-hidden ${race.status === 'completed' ? 'opacity-80' : race.status === 'next' ? 'border-[#e10600]/50 shadow-[0_0_20px_rgba(225,6,0,0.1)]' : ''}`}>
                <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#e10600] tracking-widest">R{race.round}</span>
                    <span className="text-xl">{race.flag}</span>
                  </div>
                  <div className="text-[10px] text-[#9a9ab0] uppercase tracking-widest font-semibold">{race.date}</div>
                </div>
                <div className="text-lg font-bold text-white tracking-tight mb-4 flex-1">{race.name.replace(' Grand Prix', ' GP')}</div>
                
                {race.status === 'completed' && race.podium?.length > 0 && (
                  <div className="space-y-1 mt-auto">
                    {race.podium.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold text-black ${idx===0 ? 'bg-[#e0b04a]' : idx===1 ? 'bg-[#b0b0b0]' : 'bg-[#cd7f32]'}`}>
                          P{idx+1}
                        </span>
                        <span className="font-semibold text-white/80">{p.driver}</span>
                      </div>
                    ))}
                  </div>
                )}
                {race.status === 'next' && (
                  <div className="mt-auto text-xs font-bold text-[#e10600] uppercase tracking-widest bg-[#e10600]/10 px-3 py-2 rounded">
                    🏁 Next on the calendar
                  </div>
                )}
                {race.status === 'upcoming' && (
                  <div className="mt-auto text-xs font-bold text-[#9a9ab0] uppercase tracking-widest bg-white/[0.04] px-3 py-2 rounded">
                    Upcoming
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
