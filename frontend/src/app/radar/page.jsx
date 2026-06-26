"use client";

import { useState, useEffect } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { TEAM_COLORS, DRIVERS } from "@/lib/constants";



function GlassCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "1.25rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default function RadarPage() {
  const [year, setYear] = useState(2024);
  const [driver, setDriver] = useState("VER");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function fetchRadar() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const params = new URLSearchParams({ year, driver });
        const res = await fetch(`/api/radar?${params}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `API error ${res.status}`);
        }
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        if (active) {
          setData(json);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchRadar();

    return () => {
      active = false;
    };
  }, [year, driver]);

  // Try to use team color for the driver, fallback to a nice energetic color
  const driverColor = data?.team ? TEAM_COLORS[data.team] : "#E10600";
  const gridColor = "#888888";

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "1.5rem", color: "var(--color-text-primary)" }}>
        Driver Radar Chart
      </h1>

      {/* Controls */}
      <GlassCard style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Season
            </label>
            <input
              type="number"
              value={year}
              min={2018}
              max={2025}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{
                width: "100px",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                background: "var(--color-background-secondary)",
                border: "1px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                color: "var(--color-text-primary)"
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Driver
            </label>
            <select
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              style={{
                width: "120px",
                padding: "8px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                background: "var(--color-background-secondary)",
                border: "1px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                color: "var(--color-text-primary)"
              }}
            >
              {DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Errors */}
      {error && (
        <div style={{ padding: "16px", background: "var(--color-background-danger)", color: "var(--color-text-danger)", borderRadius: "var(--border-radius-md)", marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <span style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading stats for {driver} in {year}...</span>
        </div>
      )}

      {/* Chart */}
      {data && !loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "1.5rem", alignItems: "start" }}>
          <GlassCard style={{ height: "500px", display: "flex", flexDirection: "column" }}>
            <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Performance Profile
            </h2>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data.data}>
                  <PolarGrid stroke="var(--color-border-secondary)" />
                  <PolarAngleAxis 
                    dataKey="subject" 
                    tick={{ fill: "var(--color-text-primary)", fontSize: 12, fontWeight: 500 }} 
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  
                  <Tooltip 
                    contentStyle={{ 
                      background: "var(--color-background-primary)", 
                      border: "1px solid var(--color-border-secondary)",
                      borderRadius: "var(--border-radius-md)",
                      fontSize: "12px",
                      color: "var(--color-text-primary)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
                    }}
                    itemStyle={{ padding: 0 }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "20px" }} />

                  {/* Grid Average Polygon */}
                  <Radar
                    name="Grid Average"
                    dataKey="gridScore"
                    stroke={gridColor}
                    strokeWidth={2}
                    fill={gridColor}
                    fillOpacity={0.15}
                    isAnimationActive={true}
                  />

                  {/* Driver Polygon */}
                  <Radar
                    name={data.driver}
                    dataKey="driverScore"
                    stroke={driverColor || "#fff"}
                    strokeWidth={3}
                    fill={driverColor || "#fff"}
                    fillOpacity={0.4}
                    isAnimationActive={true}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Quick Stats Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <GlassCard>
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                  Overall Rating
                </div>
                <div style={{ fontSize: "48px", fontWeight: 800, color: driverColor, lineHeight: 1 }}>
                  {data.overall}
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", marginBottom: "1rem", borderBottom: "1px solid var(--color-border-secondary)", paddingBottom: "8px" }}>
                Axis Breakdown
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.data.map(metric => (
                  <div key={metric.subject} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{metric.subject}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: driverColor }}>{metric.driverScore}</span>
                      <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)", width: "30px", textAlign: "right" }}>({metric.gridScore})</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
