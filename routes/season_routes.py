import warnings
import fastf1
import pandas as pd
from flask import Blueprint, jsonify, request
from routes.data_routes import get_session, load_sessions_concurrent, get_cached_result, save_cached_result

warnings.filterwarnings("ignore")

season_bp = Blueprint("season", __name__, url_prefix="/api/season")

_season_cache = {}


@season_bp.route("/standings")
def standings():
    year = request.args.get("year", 2024, type=int)
    cache_key = f"standings_{year}"

    # 1. Hot in-memory cache
    if cache_key in _season_cache:
        return jsonify(_season_cache[cache_key])

    # 2. Persistent disk cache (survives restarts)
    disk = get_cached_result(cache_key)
    if disk:
        _season_cache[cache_key] = disk
        return jsonify(disk)

    # 3. Compute from scratch — with concurrent loading
    try:
        schedule = fastf1.get_event_schedule(year)
        completed = [
            e for _, e in schedule.iterrows()
            if e["EventFormat"] != "testing" and e["EventDate"] < pd.Timestamp.now()
        ]

        if not completed:
            return jsonify({"error": "No completed races found for that year."}), 404

        # Load all sessions concurrently
        round_nums = [int(e["RoundNumber"]) for e in completed]
        sessions = load_sessions_concurrent(year, round_nums, max_workers=4)

        driver_points = {}
        team_points = {}
        round_labels = []

        driver_progression = {}
        team_progression = {}

        for event in completed:
            rnd = int(event["RoundNumber"])
            event_name = event["EventName"]
            round_labels.append(event_name.replace(" Grand Prix", ""))

            session = sessions.get(rnd)
            if session is None:
                continue

            try:
                results = session.results

                for _, row in results.iterrows():
                    drv = row["Abbreviation"]
                    team = row["TeamName"]
                    pts = float(row["Points"]) if pd.notna(row["Points"]) else 0

                    driver_points[drv] = driver_points.get(drv, 0) + pts
                    team_points[team] = team_points.get(team, 0) + pts

                    if drv not in driver_progression:
                        driver_progression[drv] = []
                    driver_progression[drv].append(driver_points[drv])

                    if team not in team_progression:
                        team_progression[team] = []

                for team in team_points:
                    if len(team_progression.get(team, [])) < len(round_labels):
                        if team not in team_progression:
                            team_progression[team] = []
                        team_progression[team].append(team_points[team])

            except Exception:
                continue

        for drv in driver_progression:
            while len(driver_progression[drv]) < len(round_labels):
                last = driver_progression[drv][-1] if driver_progression[drv] else 0
                driver_progression[drv].append(last)

        for team in team_progression:
            while len(team_progression[team]) < len(round_labels):
                last = team_progression[team][-1] if team_progression[team] else 0
                team_progression[team].append(last)

        sorted_drivers = sorted(driver_points.items(), key=lambda x: x[1], reverse=True)
        sorted_teams = sorted(team_points.items(), key=lambda x: x[1], reverse=True)

        top_drivers = [d[0] for d in sorted_drivers[:10]]

        result = {
            "year": year,
            "rounds": round_labels,
            "racesLoaded": len(round_labels),
            "driverStandings": [{"driver": d, "points": float(p)} for d, p in sorted_drivers],
            "teamStandings": [{"team": t, "points": float(p)} for t, p in sorted_teams],
            "driverProgression": {d: [float(v) for v in driver_progression[d]] for d in top_drivers if d in driver_progression},
            "teamProgression": {t: [float(v) for v in team_progression[t]] for t in team_progression},
            "leader": sorted_drivers[0][0] if sorted_drivers else "N/A",
            "totalDrivers": len(driver_points),
        }

        _season_cache[cache_key] = result
        save_cached_result(cache_key, result)
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

