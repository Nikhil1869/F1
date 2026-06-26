import warnings
import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request

from routes.h2h_routes import _get_season_results
from services import openf1_service

warnings.filterwarnings("ignore")

radar_bp = Blueprint("radar", __name__)

_wet_races_cache = {}


def _get_wet_rounds(year):
    if year in _wet_races_cache:
        return _wet_races_cache[year]

    wet_rounds = set()
    try:
        schedule = openf1_service.get_event_schedule(year)
        if schedule:
            for ev in schedule:
                sk = ev.get("session_key")
                rnd = ev.get("round")
                if sk and rnd:
                    weather = openf1_service.get_weather(sk)
                    # rainfall == 1 indicates rain during the session
                    if weather and any(w.get("rainfall") == 1 for w in weather):
                        wet_rounds.add(rnd)
    except Exception as e:
        print(f"[Radar] Error fetching wet weather for {year}: {e}")

    _wet_races_cache[year] = wet_rounds
    return wet_rounds


def _compute_radar_5_axis(driver_df, all_df, wet_rounds):
    """Compute normalized 0-100 radar scores for 5 axes."""
    if driver_df.empty:
        return {
            "qualifyingPace": 0,
            "racePace": 0,
            "consistency": 0,
            "overtaking": 0,
            "wetWeather": 50,
        }

    positions = driver_df["Position"].dropna()
    grids = driver_df["GridPosition"].dropna()

    # 1. Qualifying: Based on average grid position (lower is better)
    avg_grid = grids.mean() if len(grids) > 0 else 20
    qualifying = max(0, min(100, (20 - avg_grid) / 19 * 100))

    # 2. Race Pace: Based on points per race (or average finish)
    total_points = driver_df["Points"].sum()
    races = len(driver_df)
    pts_per_race = total_points / max(races, 1)
    race_pace = max(0, min(100, pts_per_race / 25 * 100))

    # 3. Consistency: Based on standard deviation of finishes
    if len(positions) > 1:
        stddev = positions.std()
        consistency = max(0, min(100, (10 - stddev) / 10 * 100))
    else:
        consistency = 50

    # 4. Overtaking: Based on positions gained (grid → finish)
    gains = grids.values - positions.values[:len(grids)]
    avg_gain = np.mean(gains) if len(gains) > 0 else 0
    overtaking = max(0, min(100, 50 + avg_gain * 5))

    # 5. Wet Weather: Based on average finish in wet races
    if wet_rounds:
        wet_df = driver_df[driver_df["RoundNumber"].isin(wet_rounds)]
        wet_positions = wet_df["Position"].dropna()
        if len(wet_positions) > 0:
            avg_wet_finish = wet_positions.mean()
            wet_weather = max(0, min(100, (20 - avg_wet_finish) / 19 * 100))
        else:
            wet_weather = 50  # Default if they didn't finish or race in wet conditions
    else:
        wet_weather = 50  # Default if no wet races that year

    return {
        "qualifyingPace": round(qualifying, 1),
        "racePace": round(race_pace, 1),
        "consistency": round(consistency, 1),
        "overtaking": round(overtaking, 1),
        "wetWeather": round(wet_weather, 1),
    }


def _compute_grid_average_radar(all_df, wet_rounds):
    """Compute average radar scores for the grid to use as a baseline."""
    # We just average the axes across all drivers who scored at least 1 point
    scorers = all_df.groupby("Abbreviation")["Points"].sum()
    valid_drivers = scorers[scorers > 0].index.tolist()
    
    if not valid_drivers:
        valid_drivers = all_df["Abbreviation"].unique()

    axes_totals = {"qualifyingPace": 0, "racePace": 0, "consistency": 0, "overtaking": 0, "wetWeather": 0}
    count = 0
    
    for drv in valid_drivers:
        drv_df = all_df[all_df["Abbreviation"] == drv]
        radar = _compute_radar_5_axis(drv_df, all_df, wet_rounds)
        for key in axes_totals:
            axes_totals[key] += radar[key]
        count += 1
        
    if count == 0:
        return axes_totals
        
    return {k: round(v / count, 1) for k, v in axes_totals.items()}


@radar_bp.route("/radar")
def get_radar():
    """
    Returns radar data for a selected driver + grid average.
    """
    year = request.args.get("year", 2024, type=int)
    driver = request.args.get("driver", "VER")

    try:
        df = _get_season_results(year)
        if df.empty:
            return jsonify({"error": f"No data available for {year}"}), 404

        driver_df = df[df["Abbreviation"] == driver].copy()
        if driver_df.empty:
            return jsonify({"error": f"No data found for driver {driver} in {year}"}), 404

        team = driver_df["TeamName"].iloc[-1] if "TeamName" in driver_df.columns else "Unknown"

        wet_rounds = _get_wet_rounds(year)

        driver_radar = _compute_radar_5_axis(driver_df, df, wet_rounds)
        grid_radar = _compute_grid_average_radar(df, wet_rounds)

        # Format for Recharts
        # We need an array like [{ subject: "Pace", A: 80, B: 60 }, ...]
        chart_data = [
            {
                "subject": "Qualifying Pace",
                "driverScore": driver_radar["qualifyingPace"],
                "gridScore": grid_radar["qualifyingPace"]
            },
            {
                "subject": "Race Pace",
                "driverScore": driver_radar["racePace"],
                "gridScore": grid_radar["racePace"]
            },
            {
                "subject": "Consistency",
                "driverScore": driver_radar["consistency"],
                "gridScore": grid_radar["consistency"]
            },
            {
                "subject": "Overtaking",
                "driverScore": driver_radar["overtaking"],
                "gridScore": grid_radar["overtaking"]
            },
            {
                "subject": "Wet Weather",
                "driverScore": driver_radar["wetWeather"],
                "gridScore": grid_radar["wetWeather"]
            }
        ]

        # Calculate a simple "overall rating"
        overall = round(sum(driver_radar.values()) / 5, 1)

        return jsonify({
            "year": year,
            "driver": driver,
            "team": team,
            "overall": overall,
            "data": chart_data
        })

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
