'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getH2HDrivers, compareH2H } from '@/lib/api';
import { F1_RED, CYAN } from '@/lib/constants';
import GlassCard from '@/components/ui/GlassCard';
import PageHeader from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Button';
import { CardGridSkeleton } from '@/components/ui/Skeleton';

function StatRow({ label, v1, v2, lowerIsBetter }) {
  const total = Math.abs(v1) + Math.abs(v2);
  const pctLeft = total > 0 ? (Math.abs(v1) / total * 100) : 50;
  
  return (
    <div className="flex items-center gap-4 py-2 border-b border-white/[0.04] last:border-0">
      <div className="w-12 text-right font-bold text-lg text-white">{v1}</div>
      <div className="flex-1 text-center">
        <div className="text-[10px] uppercase tracking-widest text-[#9a9ab0] mb-1">{label}</div>
        <div className="h-1.5 w-full flex bg-white/[0.04] rounded-full overflow-hidden">
          <div style={{ width: `${pctLeft}%` }} className="h-full bg-[#e10600]" />
          <div style={{ width: `${100 - pctLeft}%` }} className="h-full bg-[#00d2ff]" />
        </div>
      </div>
      <div className="w-12 text-left font-bold text-lg text-white">{v2}</div>
    </div>
  );
}

export default function HeadToHeadPage() {
  const [year, setYear] = useState('2024');
  const [d1, setD1] = useState('VER');
  const [d2, setD2] = useState('NOR');
  const [drivers, setDrivers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getH2HDrivers(year).then(res => {
      setDrivers(res.drivers || []);
      if (res.drivers?.length >= 2) {
        setD1(res.drivers[0].driver);
        setD2(res.drivers[1].driver);
      }
    }).catch(console.error);
  }, [year]);

  const load = async () => {
    if (d1 === d2) return alert('Please select two different drivers.');
    setLoading(true);
    try { setData(await compareH2H(year, d1, d2)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const radarData = data ? [
    { subject: 'Speed', A: data.d1.radar.speed, B: data.d2.radar.speed },
    { subject: 'Consistency', A: data.d1.radar.consistency, B: data.d2.radar.consistency },
    { subject: 'Qualifying', A: data.d1.radar.qualifying, B: data.d2.radar.qualifying },
    { subject: 'Race Pace', A: data.d1.radar.racePace, B: data.d2.radar.racePace },
    { subject: 'Overtaking', A: data.d1.radar.overtaking, B: data.d2.radar.overtaking },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto px-5 pb-16">
      <PageHeader title="Driver —" gradient="Head to Head" subtitle="Compare any two drivers across an entire season" />

      <GlassCard className="mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Season:
            <Select value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </Select>
          </label>
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Driver 1:
            <Select value={d1} onChange={(e) => setD1(e.target.value)}>
              {drivers.map(d => <option key={d.driver} value={d.driver}>{d.driver}</option>)}
            </Select>
          </label>
          <span className="text-xl font-black text-white/40 tracking-[3px]">VS</span>
          <label className="text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold flex items-center gap-2">
            Driver 2:
            <Select value={d2} onChange={(e) => setD2(e.target.value)}>
              {drivers.map(d => <option key={d.driver} value={d.driver}>{d.driver}</option>)}
            </Select>
          </label>
          <Button onClick={load} disabled={loading || drivers.length === 0}>
            {loading ? '⏳ Comparing...' : '⚔️ Compare'}
          </Button>
        </div>
      </GlassCard>

      {loading && <CardGridSkeleton count={2} />}

      {data && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Banner */}
          <GlassCard className="mb-6 flex justify-between items-center py-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 bottom-0 w-1/2 bg-gradient-to-r from-[rgba(225,6,0,0.15)] to-transparent" />
            <div className="absolute top-0 right-0 bottom-0 w-1/2 bg-gradient-to-l from-[rgba(0,210,255,0.15)] to-transparent" />
            
            <div className="text-center z-10 w-1/3">
              <div className="text-4xl font-black text-[#e10600]">{data.d1.code}</div>
              <div className="text-xs text-[#9a9ab0] uppercase tracking-widest mt-1">{data.d1.team}</div>
              <div className="text-5xl font-black text-white mt-2">{data.headToHead.d1Wins}</div>
            </div>
            <div className="text-center z-10 text-white/50 w-1/3 flex flex-col items-center">
              <div className="text-xs font-bold tracking-[3px] uppercase mb-2">Wins against teammate</div>
              <div className="text-3xl">⚔️</div>
            </div>
            <div className="text-center z-10 w-1/3">
              <div className="text-4xl font-black text-[#00d2ff]">{data.d2.code}</div>
              <div className="text-xs text-[#9a9ab0] uppercase tracking-widest mt-1">{data.d2.team}</div>
              <div className="text-5xl font-black text-white mt-2">{data.headToHead.d2Wins}</div>
            </div>
          </GlassCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Stats */}
            <GlassCard accent className="flex flex-col justify-center">
              <StatRow label="Wins" v1={data.d1.stats.wins} v2={data.d2.stats.wins} />
              <StatRow label="Podiums" v1={data.d1.stats.podiums} v2={data.d2.stats.podiums} />
              <StatRow label="Avg Finish" v1={data.d1.stats.avgFinish} v2={data.d2.stats.avgFinish} lowerIsBetter />
              <StatRow label="Avg Grid" v1={data.d1.stats.avgGrid} v2={data.d2.stats.avgGrid} lowerIsBetter />
              <StatRow label="Points" v1={data.d1.stats.points} v2={data.d2.stats.points} />
              <StatRow label="Best Finish" v1={data.d1.stats.bestFinish} v2={data.d2.stats.bestFinish} lowerIsBetter />
              <StatRow label="DNFs" v1={data.d1.stats.dnfs} v2={data.d2.stats.dnfs} lowerIsBetter />
            </GlassCard>

            {/* Radar */}
            <GlassCard accent>
              <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-2 text-center">Performance Radar</h3>
              <div className="w-full min-w-[200px] min-h-[100px] h-[320px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9a9ab0', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name={data.d1.code} dataKey="A" stroke={F1_RED} fill={F1_RED} fillOpacity={0.15} />
                    <Radar name={data.d2.code} dataKey="B" stroke={CYAN} fill={CYAN} fillOpacity={0.15} />
                    <Tooltip contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          </div>

          <GlassCard accent className="mt-4">
            <h3 className="text-xs font-bold text-[#9a9ab0] uppercase tracking-[1.5px] mb-4">Race-by-Race Finish Position</h3>
            <div className="w-full min-w-[200px] min-h-[100px] h-[300px]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={data.raceByRace}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="event" tick={{ fill: '#9a9ab0', fontSize: 10 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis reversed domain={[1, 20]} tick={{ fill: '#9a9ab0', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" name={data.d1.code} dataKey="d1Pos" stroke={F1_RED} strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" name={data.d2.code} dataKey="d2Pos" stroke={CYAN} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
