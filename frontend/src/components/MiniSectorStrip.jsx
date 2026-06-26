"use client";

/**
 * MiniSectorStrip
 *
 * Renders a horizontal row of colour-coded mini-sector segments above the
 * telemetry charts. Each segment corresponds to one 10m distance bin.
 *
 * Colours follow the official F1 timing convention:
 *   purple → driver set a time equal to or faster than the session fastest
 *   green  → driver is faster than the other driver, but not session fastest
 *   yellow → driver is slower than the other driver in this bin
 *
 * Props:
 *   miniSectors  string[]   Array of "purple" | "green" | "yellow" from the API
 *   d1           string     Driver 1 code, e.g. "VER"
 *   d2           string     Driver 2 code, e.g. "LEC"
 *   chartLeftOffset  number  Width of the Recharts Y-axis area in px (default 45)
 *                            Used to align the strip with the chart plot area.
 *   loading      boolean    Shows a skeleton when true
 */

const COLOUR_MAP = {
  purple: "#9B59FF",   // vivid purple — session fastest
  green:  "#00D166",   // clean green  — faster than D2
  yellow: "#FFD700",   // gold yellow  — slower than D2
};

export default function MiniSectorStrip({
  miniSectors = [],
  d1 = "D1",
  d2 = "D2",
  chartLeftOffset = 45,
  loading = false,
}) {
  const LEGEND = [
    { colour: "purple", label: "Session fastest" },
    { colour: "green",  label: `Faster than ${d2}` },
    { colour: "yellow", label: `Slower than ${d2}` },
  ];

  if (loading) {
    return (
      <div style={{ marginBottom: "8px" }}>
        <div
          style={{
            marginLeft: `${chartLeftOffset}px`,
            height: "16px",
            borderRadius: "3px",
            background: "var(--color-background-secondary)",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes pulse {
            0%,100%{opacity:1} 50%{opacity:0.4}
          }
        `}</style>
      </div>
    );
  }

  if (!miniSectors || miniSectors.length === 0) return null;

  return (
    <div style={{ marginBottom: "4px" }}>

      {/* ── Label row ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginLeft: `${chartLeftOffset}px`,
          marginBottom: "4px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Mini sectors — {d1}
        </span>

        {/* Legend pills */}
        <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
          {LEGEND.map(({ colour, label }) => (
            <div
              key={colour}
              style={{ display: "flex", alignItems: "center", gap: "4px" }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: COLOUR_MAP[colour],
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sector strip ─────────────────────────────────────────────────── */}
      <div
        style={{
          marginLeft: `${chartLeftOffset}px`,
          display: "flex",
          height: "14px",
          borderRadius: "3px",
          overflow: "hidden",
          gap: "0px",
        }}
        aria-label={`Mini sector strip for ${d1} vs ${d2}`}
        role="img"
      >
        {miniSectors.map((colour, i) => (
          <div
            key={i}
            title={`Bin ${i + 1}: ${colour}`}
            style={{
              flex: 1,
              background: COLOUR_MAP[colour] ?? COLOUR_MAP.yellow,
              minWidth: "1px",
            }}
          />
        ))}
      </div>

      {/* ── Distance tick marks (optional, improves alignment with x-axis) ── */}
      <div
        style={{
          marginLeft: `${chartLeftOffset}px`,
          display: "flex",
          justifyContent: "space-between",
          marginTop: "2px",
          paddingRight: "0px",
        }}
      >
        {[0, 25, 50, 75, 100].map((pct) => {
          const binIndex = Math.round((pct / 100) * (miniSectors.length - 1));
          return (
            <span
              key={pct}
              style={{
                fontSize: "10px",
                color: "var(--color-text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {pct}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
