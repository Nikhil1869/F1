import warnings

import numpy as np
import pandas as pd
from flask import Blueprint, jsonify, request

from services.data_provider import provider
from services.fastf1_service import load_sessions_concurrent

warnings.filterwarnings("ignore")

h2h_bp = Blueprint("h2h", __name__, url_prefix="/api/h2h")

_h2h_cache = {}


def _get_season_results(year):
    cache_key = f"h2h_season_{year}"
    if cache_key in _h2h_cache:
        return _h2h_cache[cache_key]

    schedule = provider.get_event_schedule(year)

    # Collect round numbers for completed races
    completed_events = []
    for _, event in schedule.iterrows():
        if event["EventFormat"] == "testing":
            continue
        if event["EventDate"] > pd.Timestamp.now():
            continue
        completed_events.append(event)

    if not completed_events:
        return pd.DataFrame()

    # Load all sessions concurrently
    round_nums = [int(e["RoundNumber"]) for e in completed_events]
    sessions = load_sessions_concurrent(year, round_nums, max_workers=4)

    frames = []
    for event in completed_events:
        rnd = int(event["RoundNumber"])
        session = sessions.get(rnd)
        if session is None:
            continue
        try:
            results = session.results.copy()
            results["RoundNumber"] = rnd
            results["EventName"] = event["EventName"]
            cols = [
                "RoundNumber", "EventName", "Abbreviation",
                "TeamName", "GridPosition", "Position", "Points", "Status",
            ]
            available = [c for c in cols if c in results.columns]
            frames.append(results[available])
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    for col in ("Position", "Points", "GridPosition"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    _h2h_cache[cache_key] = df
    return df


def _compute_radar(driver_df, all_df):
    """Compute normalized 0-100 radar scores for a driver."""
    if driver_df.empty:
        return {"speed": 0, "consistency": 0, "qualifying": 0, "racePace": 0, "overtaking": 0}

    positions = driver_df["Position"].dropna()
    grids = driver_df["GridPosition"].dropna()

    # Speed: Based on average finish (lower = better)
    avg_finish = positions.mean() if len(positions) > 0 else 20
    speed = max(0, min(100, (20 - avg_finish) / 19 * 100))

    # Consistency: Based on standard deviation of finishes (lower stddev = more consistent)
    if len(positions) > 1:
        stddev = positions.std()
        consistency = max(0, min(100, (10 - stddev) / 10 * 100))
    else:
        consistency = 50

    # Qualifying: Based on average grid position
    avg_grid = grids.mean() if len(grids) > 0 else 20
    qualifying = max(0, min(100, (20 - avg_grid) / 19 * 100))

    # Race Pace: Based on points per race
    total_points = driver_df["Points"].sum()
    races = len(driver_df)
    pts_per_race = total_points / max(races, 1)
    race_pace = max(0, min(100, pts_per_race / 25 * 100))

    # Overtaking: Based on positions gained (grid → finish)
    gains = grids.values - positions.values[:len(grids)]
    avg_gain = np.mean(gains) if len(gains) > 0 else 0
    overtaking = max(0, min(100, 50 + avg_gain * 5))

    return {
        "speed": round(speed, 1),
        "consistency": round(consistency, 1),
        "qualifying": round(qualifying, 1),
        "racePace": round(race_pace, 1),
        "overtaking": round(overtaking, 1),
    }


def _compute_stats(driver_df):
    """Compute aggregate stats for a driver."""
    positions = driver_df["Position"].dropna()
    grids = driver_df["GridPosition"].dropna()

    wins = int((positions == 1).sum())
    podiums = int((positions <= 3).sum())
    avg_finish = round(float(positions.mean()), 1) if len(positions) > 0 else 0
    avg_grid = round(float(grids.mean()), 1) if len(grids) > 0 else 0
    total_points = float(driver_df["Points"].sum())
    races = len(driver_df)

    dnfs = 0
    if "Status" in driver_df.columns:
        finished_statuses = ["Finished"]
        for s in driver_df["Status"].dropna():
            s_str = str(s)
            if s_str not in finished_statuses and "Lap" not in s_str:
                dnfs += 1

    best_finish = int(positions.min()) if len(positions) > 0 else 0

    return {
        "wins": wins,
        "podiums": podiums,
        "avgFinish": avg_finish,
        "avgGrid": avg_grid,
        "points": total_points,
        "races": races,
        "dnfs": dnfs,
        "bestFinish": best_finish,
    }


@h2h_bp.route("/drivers")
def list_drivers():
    """List all drivers for a given season."""
    year = request.args.get("year", 2024, type=int)
    try:
        # Try OpenF1 first: get drivers from the first race session (instant)
        from services import openf1_service
        schedule = openf1_service.get_event_schedule(year)
        if schedule:
            # Find the first event with a session_key
            for ev in schedule:
                sk = ev.get("session_key")
                if sk:
                    drivers_data = openf1_service.get_drivers(sk)
                    if drivers_data:
                        drivers = []
                        for d in drivers_data:
                            drivers.append({
                                "driver": d.get("name_acronym", "???"),
                                "team": d.get("team_name", "Unknown"),
                            })
                        drivers.sort(key=lambda d: d["driver"])
                        return jsonify({"drivers": drivers, "year": year})
                    break

        # Fallback: load full season from FastF1
        df = _get_season_results(year)
        if df.empty:
            return jsonify({"drivers": []})

        drivers = []
        for drv in df["Abbreviation"].unique():
            drv_rows = df[df["Abbreviation"] == drv]
            team = drv_rows["TeamName"].iloc[-1] if "TeamName" in drv_rows.columns else "Unknown"
            drivers.append({"driver": drv, "team": team})

        drivers.sort(key=lambda d: d["driver"])
        return jsonify({"drivers": drivers, "year": year})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@h2h_bp.route("/compare")
def compare():
    """Compare two drivers head-to-head for a season."""
    year = request.args.get("year", 2024, type=int)
    d1 = request.args.get("d1", "VER")
    d2 = request.args.get("d2", "NOR")

    try:
        df = _get_season_results(year)
        if df.empty:
            return jsonify({"error": f"No data available for {year}"}), 404

        df1 = df[df["Abbreviation"] == d1].copy()
        df2 = df[df["Abbreviation"] == d2].copy()

        if df1.empty:
            return jsonify({"error": f"No data found for driver {d1} in {year}"}), 404
        if df2.empty:
            return jsonify({"error": f"No data found for driver {d2} in {year}"}), 404

        # Aggregate stats
        stats1 = _compute_stats(df1)
        stats2 = _compute_stats(df2)

        # Radar scores
        radar1 = _compute_radar(df1, df)
        radar2 = _compute_radar(df2, df)

        # Race-by-race comparison
        rounds_d1 = dict(zip(df1["RoundNumber"], df1["Position"]))
        rounds_d2 = dict(zip(df2["RoundNumber"], df2["Position"]))
        event_names = dict(zip(df["RoundNumber"], df["EventName"]))

        all_rounds = sorted(set(rounds_d1.keys()) | set(rounds_d2.keys()))
        race_by_race = []
        h2h_d1_wins = 0
        h2h_d2_wins = 0

        for rnd in all_rounds:
            pos1 = rounds_d1.get(rnd)
            pos2 = rounds_d2.get(rnd)
            event = event_names.get(rnd, f"Round {rnd}")
            short_name = event.replace(" Grand Prix", "")

            entry = {
                "round": rnd,
                "event": short_name,
                "d1Pos": int(pos1) if pd.notna(pos1) else None,
                "d2Pos": int(pos2) if pd.notna(pos2) else None,
            }
            race_by_race.append(entry)

            if pd.notna(pos1) and pd.notna(pos2):
                if pos1 < pos2:
                    h2h_d1_wins += 1
                elif pos2 < pos1:
                    h2h_d2_wins += 1

        team1 = df1["TeamName"].iloc[-1] if "TeamName" in df1.columns else "Unknown"
        team2 = df2["TeamName"].iloc[-1] if "TeamName" in df2.columns else "Unknown"

        return jsonify({
            "year": year,
            "d1": {"code": d1, "team": team1, "stats": stats1, "radar": radar1},
            "d2": {"code": d2, "team": team2, "stats": stats2, "radar": radar2},
            "raceByRace": race_by_race,
            "headToHead": {"d1Wins": h2h_d1_wins, "d2Wins": h2h_d2_wins},
        })

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
