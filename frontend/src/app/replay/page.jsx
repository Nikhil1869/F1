'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getReplaySessions, loadReplay } from '@/lib/api';
import { TEAM_COLORS } from '@/lib/constants';
import { Button, Select } from '@/components/ui/Button';

export default function ReplayPage() {
  const [year, setYear] = useState(2024);
  const [events, setEvents] = useState([]);
  const [modalOpen, setModalOpen] = useState(true);
  const [replayData, setReplayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Loading race data...');

  // Playback state
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [selectedDriver, setSelectedDriver] = useState('');
  const playRef = useRef(null);
  const canvasRef = useRef(null);

  // Load sessions
  useEffect(() => {
    getReplaySessions(year).then((res) => setEvents(res.events || [])).catch(console.error);
  }, [year]);

  const selectRace = async (round) => {
    setModalOpen(false);
    setLoading(true);
    setLoadingText('Loading telemetry data... This may take a few minutes.');
    try {
      const data = await loadReplay(year, round);
      setReplayData(data);
      setFrameIdx(0);
    } catch (e) {
      console.error(e);
      setModalOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Canvas drawing
  const drawFrame = useCallback(() => {
    if (!replayData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const track = replayData.track || [];
    const frame = replayData.frames?.[frameIdx];
    if (!frame || !track.length) return;

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of track) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const pad = 40;
    const trackW = maxX - minX || 1;
    const trackH = maxY - minY || 1;
    const scaleX = (rect.width - pad * 2) / trackW;
    const scaleY = (rect.height - pad * 2) / trackH;
    const scale = Math.min(scaleX, scaleY);
    const offX = (rect.width - trackW * scale) / 2 - minX * scale;
    const offY = (rect.height - trackH * scale) / 2 - minY * scale;
    const tx = (x) => x * scale + offX;
    const ty = (y) => y * scale + offY;

    // Draw track outline
    ctx.beginPath();
    ctx.moveTo(tx(track[0][0]), ty(track[0][1]));
    for (let i = 1; i < track.length; i++) ctx.lineTo(tx(track[i][0]), ty(track[i][1]));
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw DRS zones
    if (replayData.drsZones) {
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(0,210,255,0.15)';
      for (const zone of replayData.drsZones) {
        if (!zone.length) continue;
        ctx.beginPath();
        ctx.moveTo(tx(zone[0][0]), ty(zone[0][1]));
        for (let i = 1; i < zone.length; i++) ctx.lineTo(tx(zone[i][0]), ty(zone[i][1]));
        ctx.stroke();
      }
    }

    // Draw drivers
    const drivers = frame.drivers || {};
    const driverCodes = Object.keys(drivers);
    // Sort so selected driver is drawn last (on top)
    driverCodes.sort((a, b) => (a === selectedDriver ? 1 : b === selectedDriver ? -1 : 0));

    for (const code of driverCodes) {
      const d = drivers[code];
      const info = replayData.drivers?.[code];
      const color = info?.teamColor || '#fff';
      const isSelected = code === selectedDriver;
      const r = isSelected ? 7 : 5;

      ctx.beginPath();
      ctx.arc(tx(d.x), ty(d.y), r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Glow
        ctx.beginPath();
        ctx.arc(tx(d.x), ty(d.y), 12, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Labels
      ctx.font = '600 9px Outfit, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(code, tx(d.x), ty(d.y) - r - 4);
    }

    // Safety car
    if (frame.safety_car) {
      const sc = frame.safety_car;
      ctx.globalAlpha = sc.alpha || 1;
      ctx.beginPath();
      ctx.arc(tx(sc.x), ty(sc.y), 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffc906';
      ctx.fill();
      ctx.font = 'bold 8px Outfit, sans-serif';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText('SC', tx(sc.x), ty(sc.y) + 3);
      ctx.globalAlpha = 1;
    }
  }, [replayData, frameIdx, selectedDriver]);

  useEffect(() => { drawFrame(); }, [drawFrame]);

  // Resize handler
  useEffect(() => {
    const handler = () => drawFrame();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [drawFrame]);

  // Playback loop
  useEffect(() => {
    if (!playing || !replayData) return;
    const totalFrames = replayData.frames?.length || 0;
    const interval = (replayData.dt || 0.5) * 1000 / speed;

    playRef.current = setInterval(() => {
      setFrameIdx((prev) => {
        if (prev >= totalFrames - 1) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, interval);

    return () => clearInterval(playRef.current);
  }, [playing, speed, replayData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const totalFrames = replayData?.frames?.length || 0;
      switch (e.key) {
        case ' ': e.preventDefault(); setPlaying((p) => !p); break;
        case 'ArrowLeft': setFrameIdx((p) => Math.max(0, p - Math.floor(1 / (replayData?.dt || 0.5)))); break;
        case 'ArrowRight': setFrameIdx((p) => Math.min(totalFrames - 1, p + Math.floor(1 / (replayData?.dt || 0.5)))); break;
        case 'r': case 'R': setFrameIdx(0); setPlaying(false); break;
        case '1': setSpeed(0.5); break;
        case '2': setSpeed(1); break;
        case '3': setSpeed(2); break;
        case '4': setSpeed(4); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [replayData]);

  const frame = replayData?.frames?.[frameIdx];
  const totalFrames = replayData?.frames?.length || 0;
  const currentLap = frame?.lap || 1;
  const totalLaps = replayData?.totalLaps || 1;

  // Build leaderboard from frame
  const leaderboard = frame ? Object.entries(frame.drivers || {})
    .map(([code, d]) => ({ code, ...d, info: replayData.drivers?.[code] }))
    .sort((a, b) => b.dist - a.dist) : [];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-[#0a0a12]">
      {/* Top Bar */}
      {replayData && (
        <div className="h-12 border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0" style={{ background: 'rgba(12,12,20,0.95)', backdropFilter: 'blur(12px)' }}>
          <button onClick={() => { setReplayData(null); setModalOpen(true); setPlaying(false); }}
            className="text-sm text-[#9a9ab0] hover:text-white transition-colors bg-transparent border-none cursor-pointer flex items-center gap-2">
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-[#e10600] text-white text-[0.6rem] font-bold rounded uppercase tracking-wider">Race Replay</span>
            <span className="text-sm font-bold">{replayData.eventName}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#9a9ab0]">
            <div><span className="uppercase tracking-wider">Lap</span> <span className="text-white font-bold ml-1">{currentLap}/{totalLaps}</span></div>
            <div><span className="uppercase tracking-wider">Speed</span> <span className="text-white font-bold ml-1">{speed}x</span></div>
          </div>
        </div>
      )}

      {/* Session Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass rounded-[14px] p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-black mb-1">🏁 Select a Race</h2>
              <p className="text-sm text-[#9a9ab0] mb-5">Choose a Grand Prix to replay</p>
              <div className="flex items-center gap-3 mb-5">
                <label className="text-xs text-[#9a9ab0] uppercase font-semibold">Season:</label>
                <Select value={year} onChange={(e) => setYear(+e.target.value)}>
                  <option value={2024}>2024</option><option value={2023}>2023</option><option value={2022}>2022</option>
                </Select>
              </div>
              <div className="space-y-2">
                {events.map((ev) => (
                  <motion.button key={ev.round} whileHover={{ x: 4 }} onClick={() => selectRace(ev.round)}
                    className="w-full text-left p-3.5 rounded-lg bg-[#12121e] border border-white/[0.06] hover:border-[#e10600] hover:bg-[rgba(225,6,0,0.05)] transition-all cursor-pointer flex items-center justify-between group">
                    <div>
                      <div className="font-bold text-sm">{ev.name}</div>
                      <div className="text-xs text-[#5e5e75]">{ev.country} · {ev.date?.split(' ')[0]}</div>
                    </div>
                    <span className="text-[#e10600] opacity-0 group-hover:opacity-100 transition-opacity text-lg">→</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading */}
      {loading && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[rgba(10,10,18,0.92)] backdrop-blur-md gap-5">
          <div className="w-12 h-12 border-4 border-white/[0.08] border-t-[#e10600] rounded-full" style={{ animation: 'spin 0.7s linear infinite' }} />
          <p className="text-sm text-[#9a9ab0] uppercase tracking-wide font-semibold">{loadingText}</p>
        </div>
      )}

      {/* Main Replay Area */}
      {replayData && !loading && (
        <div className="flex-1 flex overflow-hidden">
          {/* Leaderboard */}
          <aside className="w-56 border-r border-white/[0.06] overflow-y-auto shrink-0 hidden md:block" style={{ background: 'rgba(12,12,20,0.8)' }}>
            <div className="p-3 border-b border-white/[0.06]">
              <h3 className="text-[0.65rem] font-bold uppercase tracking-[2px] text-[#9a9ab0]">Live Standings</h3>
            </div>
            <div>
              {leaderboard.map((d, i) => (
                <div key={d.code} onClick={() => setSelectedDriver(d.code === selectedDriver ? '' : d.code)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-all text-xs border-b border-white/[0.03] ${d.code === selectedDriver ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                  <span className="w-5 text-center font-black text-[#9a9ab0]">{i + 1}</span>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.info?.teamColor || '#fff' }} />
                  <span className="font-bold flex-1">{d.code}</span>
                  <span className="text-[#5e5e75] tabular-nums">{d.speed} km/h</span>
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas + Controls */}
          <div className="flex-1 flex flex-col">
            {/* Weather */}
            {frame?.weather && (
              <div className="h-8 flex items-center gap-4 px-4 text-[0.65rem] text-[#9a9ab0] border-b border-white/[0.04] shrink-0">
                <span>🌡️ {frame.weather.air_temp}°C</span>
                <span>🛣️ {frame.weather.track_temp}°C</span>
                <span>💧 {frame.weather.humidity}%</span>
                <span>💨 {frame.weather.wind_speed} km/h</span>
                {frame.weather.rainfall && <span className="text-[#00d2ff]">🌧️ Rain</span>}
              </div>
            )}

            {/* Safety Car Banner */}
            {frame?.safety_car && (
              <div className="h-8 flex items-center justify-center gap-2 text-sm font-bold text-black bg-[#ffc906] shrink-0">
                🟡 SAFETY CAR
              </div>
            )}

            {/* Track Canvas */}
            <div className="flex-1 relative">
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            </div>

            {/* Progress Bar */}
            <div className="px-4 py-2 border-t border-white/[0.06] shrink-0">
              <input type="range" min={0} max={totalFrames - 1} value={frameIdx} onChange={(e) => setFrameIdx(+e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, #e10600 ${(frameIdx / (totalFrames - 1)) * 100}%, rgba(255,255,255,0.1) 0%)` }} />
              <div className="flex justify-between text-[0.6rem] text-[#5e5e75] mt-1">
                <span>Lap 1</span><span>Lap {totalLaps}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="h-12 flex items-center justify-center gap-3 px-4 border-t border-white/[0.06] shrink-0" style={{ background: 'rgba(12,12,20,0.9)' }}>
              <button onClick={() => { setFrameIdx(0); setPlaying(false); }} className="w-9 h-9 rounded-md bg-[#12121e] border border-white/[0.08] flex items-center justify-center text-white hover:border-[#e10600] transition-colors" title="Restart">⏮</button>
              <button onClick={() => setFrameIdx((p) => Math.max(0, p - 20))} className="w-9 h-9 rounded-md bg-[#12121e] border border-white/[0.08] flex items-center justify-center text-white hover:border-[#e10600] transition-colors" title="Rewind">⏪</button>
              <button onClick={() => setPlaying((p) => !p)} className="w-11 h-11 rounded-full bg-[#e10600] flex items-center justify-center text-white text-lg shadow-[0_0_16px_rgba(225,6,0,0.4)]" title="Play/Pause">
                {playing ? '⏸' : '▶'}
              </button>
              <button onClick={() => setFrameIdx((p) => Math.min(totalFrames - 1, p + 20))} className="w-9 h-9 rounded-md bg-[#12121e] border border-white/[0.08] flex items-center justify-center text-white hover:border-[#e10600] transition-colors" title="Forward">⏩</button>
              <div className="flex gap-1 ml-3">
                {[0.5, 1, 2, 4].map((s) => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded text-[0.65rem] font-bold transition-all ${speed === s ? 'bg-[#e10600] text-white' : 'bg-[#12121e] text-[#9a9ab0] border border-white/[0.08] hover:border-[#e10600]'}`}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Driver Insights Panel */}
          {selectedDriver && (
            <aside className="w-56 border-l border-white/[0.06] overflow-y-auto shrink-0 hidden lg:block p-4" style={{ background: 'rgba(12,12,20,0.8)' }}>
              <h3 className="text-[0.65rem] font-bold uppercase tracking-[2px] text-[#9a9ab0] mb-3">Driver Insights</h3>
              {(() => {
                const d = frame?.drivers?.[selectedDriver];
                const info = replayData.drivers?.[selectedDriver];
                if (!d) return <p className="text-xs text-[#5e5e75]">No data</p>;
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: info?.teamColor }} />
                      <span className="font-bold text-sm">{selectedDriver}</span>
                      <span className="text-xs text-[#5e5e75]">{info?.team}</span>
                    </div>
                    {[['Speed', `${d.speed} km/h`], ['Gear', d.gear], ['Throttle', `${d.throttle}%`], ['Brake', `${d.brake}%`],
                      ['DRS', d.drs >= 10 ? 'OPEN' : 'Closed'], ['Tyre', d.compound], ['Tyre Life', `${d.tyreLife} laps`]
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-[#5e5e75] uppercase tracking-wide">{label}</span>
                        <span className="font-bold tabular-nums">{val}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
