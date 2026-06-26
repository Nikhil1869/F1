"use client";

/**
 * /strategy page
 *
 * Tyre strategy Gantt chart for a race session.
 * Follows the exact same pattern as your telemetry page:
 *   1. useSessionLoader pre-loads the session (progress bar)
 *   2. Once ready, fetch /api/strategy (instant, cached)
 *   3. Render StrategyGanttChart
 */

import { useState, useEffect, useCallback } from "react";
import { useSessionLoader } from "@/hooks/useSessionLoader";
import StrategyGanttChart from "@/components/StrategyGanttChart";



function GlassCard({ children, style = {} }) {
  return (
    <div
      style={{
        background: "var(--color-background-primary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        padding: "1rem 1.25rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ProgressBar({ value = 0, message = "" }) {
  return (
    <GlassCard style={{ marginBottom: "1rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "12px", fontWeight: 500 }}>
          {message || "Loading session..."}
        </span>
        <span style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}>
          {value}%
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: "4px",
          borderRadius: "2px",
          background: "var(--color-background-secondary)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            background: "linear-gradient(90deg, #E10600 0%, #0067AD 100%)",
            transition: "width 0.3s ease-out",
          }}
        />
      </div>
    </GlassCard>
  );
}

export default function StrategyPage() {
  const [year, setYear] = useState(2024);
  const [round, setRound] = useState(5);
  const sessionType = "R"; // strategy only makes sense for race sessions

  const {
    loading: sessionLoading,
    progress: sessionProgress,
    error: sessionError,
    ready: sessionReady,
  } = useSessionLoader(year, round, sessionType, true);

  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  // Selected stint (for click-to-inspect)
  const [selected, setSelected] = useState(null);

  const fetchStrategy = useCallback(async () => {
    if (!sessionReady) return;

    setDataLoading(true);
    setDataError(null);

    try {
      const params = new URLSearchParams({ year, round, session: sessionType });
      const res = await fetch(`/api/strategy?${params}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setDataError(err.message);
    } finally {
      setDataLoading(false);
    }
  }, [year, round, sessionReady]);

  useEffect(() => {
    if (sessionReady) {
      setData(null);
      fetchStrategy();
    }
  }, [sessionReady, fetchStrategy]);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1.25rem 3rem" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "1.25rem" }}>
        Tyre strategy
      </h1>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <GlassCard style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Year
            </label>
            <input
              type="number"
              value={year}
              min={2018}
              max={2025}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: "90px", fontFamily: "var(--font-mono)", fontSize: "13px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Round
            </label>
            <input
              type="number"
              value={round}
              min={1}
              max={24}
              onChange={(e) => setRound(Number(e.target.value))}
              style={{ width: "90px", fontFamily: "var(--font-mono)", fontSize: "13px" }}
            />
          </div>
        </div>
      </GlassCard>

      {/* ── Session loading ───────────────────────────────────────────── */}
      {sessionLoading && (
        <ProgressBar value={sessionProgress} message="Pre-loading session..." />
      )}

      {/* ── Errors ────────────────────────────────────────────────────── */}
      {(sessionError || dataError) && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--color-background-danger)",
            border: "0.5px solid var(--color-border-danger)",
            borderRadius: "var(--border-radius-md)",
            color: "var(--color-text-danger)",
            fontSize: "13px",
            marginBottom: "1rem",
          }}
        >
          {sessionError || dataError}
        </div>
      )}

      {/* ── Gantt chart ───────────────────────────────────────────────── */}
      {(dataLoading || data) && (
        <GlassCard>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-secondary)",
              margin: "0 0 12px",
            }}
          >
            Pit stops & compound stints ({data?.total_laps ?? "—"} laps)
          </p>

          <StrategyGanttChart
            data={data}
            loading={dataLoading}
            onStintClick={(driver, stint) => setSelected({ driver, stint })}
          />

          {/* ── Selected stint detail panel ───────────────────────────── */}
          {selected && (
            <div
              style={{
                marginTop: "1rem",
                padding: "10px 14px",
                background: "var(--color-background-secondary)",
                borderRadius: "var(--border-radius-md)",
                fontSize: "12px",
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <span>
                <strong>{selected.driver}</strong>
              </span>
              <span>Compound: {selected.stint.compound}</span>
              <span>
                Laps {selected.stint.start_lap}–{selected.stint.end_lap} (
                {selected.stint.lap_count} laps)
              </span>
              {selected.stint.tyre_life_start != null && (
                <span>
                  Tyre life: {selected.stint.tyre_life_start}–
                  {selected.stint.tyre_life_end}
                </span>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  marginLeft: "auto",
                  border: "none",
                  background: "none",
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
