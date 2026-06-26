"""
NEW ENDPOINT: /api/strategy

Returns tyre stint data for every driver in a session, built from
FastF1's laps.Compound and laps.TyreLife columns.

Add this route to your existing data_routes.py Blueprint (or a new
strategy_routes.py Blueprint — register it the same way as your others).

Plugs into the same non-blocking session cache from fastf1_service.py:
  - Call POST /api/session/load first (your existing async pattern)
  - Once status == "ready", this endpoint reads from cache instantly
"""

from flask import Blueprint, jsonify, request
import pandas as pd

from services.fastf1_service import get_session, SessionNotCachedError

strategy_bp = Blueprint("strategy", __name__)


# Official-ish F1 compound colours, used by the frontend Gantt component.
# Sent back from the API too so the frontend doesn't need to hardcode a
# mapping that could drift out of sync with the backend.
COMPOUND_COLOURS = {
    "SOFT":       "#E10600",  # red
    "MEDIUM":     "#FFD12E",  # yellow
    "HARD":       "#F0F0F0",  # white / light grey
    "INTERMEDIATE": "#43B02A",  # green
    "WET":        "#0067AD",  # blue
    "UNKNOWN":    "#9CA3AF",  # grey fallback
}


@strategy_bp.route("/strategy", methods=["GET"])
def strategy():
    """
    Query params:
        year     int   e.g. 2024
        round    int   e.g. 5
        session  str   "R" | "Q" (default "R" — stints really only make
                        sense for race sessions, but Q is allowed for
                        completeness)

    Response JSON:
    {
        "year": 2024,
        "round": 5,
        "session": "R",
        "total_laps": 78,
        "compound_colours": { "SOFT": "#E10600", ... },
        "drivers": [
            {
                "driver": "VER",
                "team": "Red Bull Racing",
                "team_colour": "#3671C6",
                "stints": [
                    {
                        "compound": "MEDIUM",
                        "start_lap": 1,
                        "end_lap": 18,
                        "lap_count": 18,
                        "tyre_life_start": 1,
                        "tyre_life_end": 18
                    },
                    {
                        "compound": "HARD",
                        "start_lap": 19,
                        "end_lap": 78,
                        "lap_count": 60,
                        "tyre_life_start": 1,
                        "tyre_life_end": 60
                    }
                ]
            },
            ...
        ]
    }
    """
    year      = int(request.args.get("year",    2024))
    round_num = int(request.args.get("round",   1))
    ses_type  =     request.args.get("session", "R")

    try:
        session = get_session(year, round_num, ses_type)
    except SessionNotCachedError:
        # Matches the async-loading pattern used elsewhere in the app —
        # tell the client to trigger /api/session/load first.
        return jsonify({
            "error": "Session not loaded yet",
            "hint": (
                f"POST /api/session/load?year={year}"
                f"&round={round_num}&session={ses_type} first, "
                f"then poll /api/session/status/{{job_id}}"
            ),
        }), 202

    try:
        laps = session.laps

        if laps is None or laps.empty:
            return jsonify({"error": "No lap data available for this session"}), 404

        total_laps = int(laps["LapNumber"].max())

        drivers_payload = []

        # Iterate drivers in finishing-order-ish (by driver number is fine)
        for drv in laps["Driver"].unique():
            drv_laps = laps.pick_driver(drv).sort_values("LapNumber")

            if drv_laps.empty:
                continue

            # Team info — used for the row colour accent on the frontend
            team_name = drv_laps["Team"].iloc[0] if "Team" in drv_laps else "Unknown"
            try:
                team_colour = f"#{session.get_driver(drv)['TeamColor']}"
            except Exception:
                team_colour = "#888888"

            # ── Build stints by grouping consecutive laps with the same
            #    "Stint" number (FastF1 already numbers stints for us).
            stints = []
            if "Stint" in drv_laps.columns:
                for stint_num, stint_laps in drv_laps.groupby("Stint"):
                    if stint_laps.empty:
                        continue

                    compound = stint_laps["Compound"].iloc[0]
                    if pd.isna(compound):
                        compound = "UNKNOWN"
                    compound = str(compound).upper()

                    start_lap = int(stint_laps["LapNumber"].min())
                    end_lap   = int(stint_laps["LapNumber"].max())

                    tyre_life = stint_laps["TyreLife"].dropna()
                    tyre_life_start = int(tyre_life.min()) if not tyre_life.empty else None
                    tyre_life_end   = int(tyre_life.max()) if not tyre_life.empty else None

                    stints.append({
                        "compound":        compound,
                        "start_lap":       start_lap,
                        "end_lap":         end_lap,
                        "lap_count":       end_lap - start_lap + 1,
                        "tyre_life_start": tyre_life_start,
                        "tyre_life_end":   tyre_life_end,
                    })
            else:
                # Fallback: if FastF1 didn't compute "Stint" (older versions),
                # derive it ourselves by detecting compound changes.
                current = None
                stint_start = None
                for _, row in drv_laps.iterrows():
                    compound = str(row["Compound"]).upper() if not pd.isna(row["Compound"]) else "UNKNOWN"
                    lap_num = int(row["LapNumber"])
                    if compound != current:
                        if current is not None:
                            stints.append({
                                "compound": current,
                                "start_lap": stint_start,
                                "end_lap": lap_num - 1,
                                "lap_count": (lap_num - 1) - stint_start + 1,
                                "tyre_life_start": None,
                                "tyre_life_end": None,
                            })
                        current = compound
                        stint_start = lap_num
                if current is not None:
                    last_lap = int(drv_laps["LapNumber"].max())
                    stints.append({
                        "compound": current,
                        "start_lap": stint_start,
                        "end_lap": last_lap,
                        "lap_count": last_lap - stint_start + 1,
                        "tyre_life_start": None,
                        "tyre_life_end": None,
                    })

            # Sort stints chronologically and stamp unknown colours
            stints.sort(key=lambda s: s["start_lap"])
            for s in stints:
                if s["compound"] not in COMPOUND_COLOURS:
                    s["compound"] = "UNKNOWN"

            drivers_payload.append({
                "driver":      drv,
                "team":        team_name,
                "team_colour": team_colour,
                "stints":      stints,
            })

        # Sort drivers by final classified position if available, else alphabetically
        try:
            results = session.results
            order = {row["Abbreviation"]: row["Position"] for _, row in results.iterrows()}
            drivers_payload.sort(
                key=lambda d: order.get(d["driver"], 999) if order.get(d["driver"]) is not None else 999
            )
        except Exception:
            drivers_payload.sort(key=lambda d: d["driver"])

        return jsonify({
            "year":              year,
            "round":             round_num,
            "session":           ses_type,
            "total_laps":        total_laps,
            "compound_colours":  COMPOUND_COLOURS,
            "drivers":           drivers_payload,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
