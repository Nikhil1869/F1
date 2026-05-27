import warnings

import fastf1
import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request

from routes.data_routes import get_session, get_cached_result, save_cached_result

warnings.filterwarnings("ignore")

laptimes_bp = Blueprint("laptimes", __name__, url_prefix="/api/laptimes")

_laptimes_cache = {}

# Compound colors for the frontend
COMPOUND_COLORS = {
    "SOFT": "#e10600",
    "MEDIUM": "#ffc906",
    "HARD": "#f0f0f0",
    "INTERMEDIATE": "#43b02a",
    "WET": "#0072c6",
    "UNKNOWN": "#888888",
}


@laptimes_bp.route("/sessions")
def available_sessions():
    """List available race sessions for lap time analysis."""
    year = request.args.get("year", 2024, type=int)
    try:
        schedule = fastf1.get_event_schedule(year)
        events = []
        for _, row in schedule.iterrows():
            if row["EventFormat"] == "testing":
                continue
            if row["EventDate"] > pd.Timestamp.now():
                continue
            events.append({
                "round": int(row["RoundNumber"]),
                "name": row["EventName"],
                "country": row.get("Country", ""),
                "date": str(row.get("EventDate", "")),
            })
        return jsonify({"year": year, "events": events})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@laptimes_bp.route("/analysis")
def analysis():
    """Full lap time analysis for a race."""
    year = request.args.get("year", 2024, type=int)
    round_num = request.args.get("round", 1, type=int)

    cache_key = f"laptimes_{year}_{round_num}"
    if cache_key in _laptimes_cache:
        return jsonify(_laptimes_cache[cache_key])

    # Persistent disk cache
    disk = get_cached_result(cache_key)
    if disk:
        _laptimes_cache[cache_key] = disk
        return jsonify(disk)

    try:
        session = get_session(year, round_num)
        laps = session.laps.copy()

        if laps.empty:
            return jsonify({"error": "No lap data available"}), 404

        # Get event name
        event_name = session.event["EventName"] if session.event is not None else f"Round {round_num}"

        # Convert lap times to seconds
        laps["LapTimeSeconds"] = laps["LapTime"].dt.total_seconds()

        # Filter out laps with no time (pit in/out laps often)
        valid_laps = laps[laps["LapTimeSeconds"].notna()].copy()

        # Compute median and filter extreme outliers (> 150% of median)
        if not valid_laps.empty:
            median_time = valid_laps["LapTimeSeconds"].median()
            outlier_threshold = median_time * 1.5
            clean_laps = valid_laps[valid_laps["LapTimeSeconds"] <= outlier_threshold].copy()
        else:
            clean_laps = valid_laps

        # Get driver list
        all_drivers = []
        for drv in session.results.itertuples():
            pos = int(drv.Position) if pd.notna(getattr(drv, 'Position', None)) else 99
            all_drivers.append({
                "driver": drv.Abbreviation,
                "team": getattr(drv, 'TeamName', 'Unknown'),
                "position": pos,
            })
        all_drivers.sort(key=lambda d: d["position"])

        # Per-driver lap times
        driver_laps = {}
        for drv_code in clean_laps["Driver"].unique():
            drv_laps = clean_laps[clean_laps["Driver"] == drv_code].copy()
            laps_data = []
            for _, lap in drv_laps.iterrows():
                compound = str(lap.get("Compound", "UNKNOWN"))
                tyre_life = int(lap["TyreLife"]) if pd.notna(lap.get("TyreLife")) else 0
                laps_data.append({
                    "lap": int(lap["LapNumber"]),
                    "time": round(float(lap["LapTimeSeconds"]), 3),
                    "compound": compound,
                    "tyreLife": tyre_life,
                })
            driver_laps[drv_code] = laps_data

        # Stint analysis per driver
        driver_stints = {}
        for drv_code in clean_laps["Driver"].unique():
            drv_laps = clean_laps[clean_laps["Driver"] == drv_code].sort_values("LapNumber")
            stints = []
            current_compound = None
            stint_laps = []

            for _, lap in drv_laps.iterrows():
                compound = str(lap.get("Compound", "UNKNOWN"))
                if compound != current_compound:
                    if stint_laps and current_compound:
                        stints.append(_build_stint(stint_laps, current_compound))
                    current_compound = compound
                    stint_laps = []
                stint_laps.append(lap)

            if stint_laps and current_compound:
                stints.append(_build_stint(stint_laps, current_compound))

            driver_stints[drv_code] = stints

        # Fastest laps leaderboard
        fastest_laps = []
        if not clean_laps.empty:
            sorted_laps = clean_laps.sort_values("LapTimeSeconds").head(15)
            for idx, (_, lap) in enumerate(sorted_laps.iterrows()):
                fastest_laps.append({
                    "rank": idx + 1,
                    "driver": lap["Driver"],
                    "lap": int(lap["LapNumber"]),
                    "time": round(float(lap["LapTimeSeconds"]), 3),
                    "timeFormatted": _format_laptime(lap["LapTimeSeconds"]),
                    "compound": str(lap.get("Compound", "UNKNOWN")),
                })

        # Compound distribution
        compound_stats = {}
        for compound in clean_laps["Compound"].dropna().unique():
            comp_str = str(compound)
            comp_laps = clean_laps[clean_laps["Compound"] == compound]["LapTimeSeconds"]
            compound_stats[comp_str] = {
                "count": int(len(comp_laps)),
                "avg": round(float(comp_laps.mean()), 3) if len(comp_laps) > 0 else 0,
                "min": round(float(comp_laps.min()), 3) if len(comp_laps) > 0 else 0,
                "max": round(float(comp_laps.max()), 3) if len(comp_laps) > 0 else 0,
                "median": round(float(comp_laps.median()), 3) if len(comp_laps) > 0 else 0,
                "color": COMPOUND_COLORS.get(comp_str, "#888888"),
            }

        total_laps = int(clean_laps["LapNumber"].max()) if not clean_laps.empty else 0

        result = {
            "year": year,
            "round": round_num,
            "eventName": event_name,
            "totalLaps": total_laps,
            "drivers": all_drivers,
            "driverLaps": driver_laps,
            "driverStints": driver_stints,
            "fastestLaps": fastest_laps,
            "compoundStats": compound_stats,
            "compoundColors": COMPOUND_COLORS,
        }

        _laptimes_cache[cache_key] = result
        save_cached_result(cache_key, result)
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _build_stint(laps_list, compound):
    """Build a stint summary from a list of lap rows."""
    times = [float(lap["LapTimeSeconds"]) for lap in laps_list if pd.notna(lap.get("LapTimeSeconds"))]
    lap_numbers = [int(lap["LapNumber"]) for lap in laps_list]

    avg_pace = round(np.mean(times), 3) if times else 0

    # Calculate degradation slope (seconds per lap)
    degradation = 0.0
    if len(times) >= 3:
        x = np.arange(len(times))
        coeffs = np.polyfit(x, times, 1)
        degradation = round(float(coeffs[0]), 4)

    return {
        "compound": compound,
        "startLap": min(lap_numbers) if lap_numbers else 0,
        "endLap": max(lap_numbers) if lap_numbers else 0,
        "laps": len(lap_numbers),
        "avgPace": avg_pace,
        "avgPaceFormatted": _format_laptime(avg_pace),
        "degradation": degradation,
        "color": COMPOUND_COLORS.get(compound, "#888888"),
    }


def _format_laptime(seconds):
    """Format lap time as M:SS.mmm"""
    if seconds <= 0 or np.isnan(seconds):
        return "--:--.---"
    mins = int(seconds // 60)
    secs = seconds % 60
    return f"{mins}:{secs:06.3f}"
