"use client";

/**
 * StrategyGanttChart
 *
 * Horizontal Gantt-style chart showing tyre stints for every driver
 * across a race. Each row is a driver, each segment is a stint coloured
 * by compound (soft/medium/hard/inter/wet).
 *
 * Props:
 *   data      object   The full /api/strategy response:
 *                       {
 *                         total_laps: number,
 *                         compound_colours: { SOFT: "#...", ... },
 *                         drivers: [
 *                           { driver, team, team_colour, stints: [...] }
 *                         ]
 *                       }
 *   loading   boolean  Shows skeleton rows when true
 *   onStintClick  (driver, stint) => void   Optional click handler
 *
 * No external dependencies — pure CSS/flex/grid, so it's cheap to render
 * even for 20 drivers x several stints each.
 */

const FALLBACK_COLOURS = {
  SOFT: "#E10600",
  MEDIUM: "#FFD12E",
  HARD: "#F0F0F0",
  INTERMEDIATE: "#43B02A",
  WET: "#0067AD",
  UNKNOWN: "#9CA3AF",
};

const COMPOUND_LABEL = {
  SOFT: "S",
  MEDIUM: "M",
  HARD: "H",
  INTERMEDIATE: "I",
  WET: "W",
  UNKNOWN: "?",
};

// Width reserved for the driver code column (left side of each row)
const LABEL_WIDTH = 64;

function SkeletonRows({ rows = 6 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: LABEL_WIDTH,
              height: "12px",
              borderRadius: "3px",
              background: "var(--color-background-secondary)",
              animation: "pulse 1.4s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              height: "20px",
              borderRadius: "3px",
              background: "var(--color-background-secondary)",
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

export default function StrategyGanttChart({ data, loading = false, onStintClick }) {
  if (loading) {
    return <SkeletonRows rows={8} />;
  }

  if (!data || !data.drivers || data.drivers.length === 0) {
    return (
      <div
        style={{
          padding: "2rem 1rem",
          textAlign: "center",
          color: "var(--color-text-tertiary)",
          fontSize: "13px",
        }}
      >
        No strategy data available for this session.
      </div>
    );
  }

  const { total_laps, drivers } = data;
  const colours = { ...FALLBACK_COLOURS, ...(data.compound_colours ?? {}) };

  // Lap-number tick marks along the top axis
  const tickCount = Math.min(6, Math.max(2, Math.round(total_laps / 10)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((i / tickCount) * total_laps)
  );

  return (
    <div>
      {/* ── Top axis: lap number ticks ─────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          marginLeft: `${LABEL_WIDTH + 8}px`,
          marginBottom: "6px",
          position: "relative",
          height: "14px",
        }}
      >
        {ticks.map((lap, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${(lap / total_laps) * 100}%`,
              transform: i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-tertiary)",
              whiteSpace: "nowrap",
            }}
          >
            Lap {lap}
          </span>
        ))}
      </div>

      {/* ── Driver rows ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {drivers.map((d) => (
          <div
            key={d.driver}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            {/* Driver code + team colour accent */}
            <div
              style={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  width: "3px",
                  height: "16px",
                  borderRadius: "2px",
                  background: d.team_colour || "#888",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-primary)",
                }}
              >
                {d.driver}
              </span>
            </div>

            {/* Stint bar */}
            <div
              style={{
                flex: 1,
                display: "flex",
                height: "20px",
                borderRadius: "3px",
                overflow: "hidden",
                background: "var(--color-background-secondary)",
              }}
            >
              {d.stints.map((stint, i) => {
                const widthPct = (stint.lap_count / total_laps) * 100;
                const colour = colours[stint.compound] ?? colours.UNKNOWN;
                const label = COMPOUND_LABEL[stint.compound] ?? "?";

                // Dark text for light compounds (HARD/MEDIUM), light text otherwise
                const textColour =
                  stint.compound === "HARD" || stint.compound === "MEDIUM"
                    ? "#1A1A1A"
                    : "#FFFFFF";

                return (
                  <div
                    key={i}
                    onClick={() => onStintClick?.(d.driver, stint)}
                    title={`${d.driver} — ${stint.compound} — laps ${stint.start_lap}-${stint.end_lap} (${stint.lap_count} laps)`}
                    style={{
                      width: `${widthPct}%`,
                      minWidth: widthPct > 0 ? "4px" : 0,
                      background: colour,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: onStintClick ? "pointer" : "default",
                      borderRight:
                        i < d.stints.length - 1
                          ? "1px solid var(--color-background-primary)"
                          : "none",
                      transition: "filter 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.12)")}
                    onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
                  >
                    {/* Only show the compound letter if the segment is wide enough */}
                    {widthPct > 4 && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          color: textColour,
                          userSelect: "none",
                        }}
                      >
                        {label}
                        {widthPct > 9 && (
                          <span style={{ opacity: 0.7, marginLeft: "3px" }}>
                            {stint.lap_count}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "14px",
          flexWrap: "wrap",
          marginTop: "1rem",
          marginLeft: `${LABEL_WIDTH + 8}px`,
        }}
      >
        {Object.entries(colours)
          .filter(([key]) => key !== "UNKNOWN")
          .map(([key, colour]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "2px",
                  background: colour,
                  border:
                    key === "HARD" ? "0.5px solid var(--color-border-tertiary)" : "none",
                }}
              />
              <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                {COMPOUND_LABEL[key]} — {key.charAt(0) + key.slice(1).toLowerCase()}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
