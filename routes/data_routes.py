import warnings

import pandas as pd
from flask import Blueprint, jsonify, request

from config import DEFAULT_YEAR, DEFAULT_ROUND, TELEMETRY_STEP
from services import openf1_service
from services.fastf1_service import get_session
from services.cache_service import get_cached_result, save_cached_result, MemoryCache

warnings.filterwarnings("ignore")

data_bp = Blueprint("data", __name__, url_prefix="/api/data")

_data_cache = MemoryCache()

POINTS_BY_POSITION = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
}


def _points_for_position(position):
    try:
        return POINTS_BY_POSITION.get(int(position), 0)
    except (TypeError, ValueError):
        return 0


def _team_points_from_openf1(year, round_num):
    events = openf1_service.get_event_schedule(year)
    event = next((ev for ev in events if ev.get("round") == round_num), None)
    if not event or not event.get("session_key"):
        return None

    results = openf1_service.get_race_results(event["session_key"])
    if not results:
        return None

    drivers = []
    team_points = {}
    for row in results:
        driver = row.get("driver")
        team = row.get("team") or "Unknown"
        position = row.get("position")
        points = _points_for_position(position)
        if not driver:
            continue
        try:
            position_value = int(position)
        except (TypeError, ValueError):
            position_value = 99

        team_points[team] = team_points.get(team, 0) + points
        drivers.append({
            "Abbreviation": driver,
            "TeamName": team,
            "Points": points,
            "Position": position_value,
        })

    drivers.sort(key=lambda item: item["Position"])
    teams = [
        {"TeamName": team, "Points": points}
        for team, points in sorted(team_points.items(), key=lambda item: item[1], reverse=True)
    ]

    return {
        "teams": teams,
        "drivers": drivers[:10],
        "race": event.get("name") or f"{year} Round {round_num}",
        "dataSource": "OpenF1",
    }


@data_bp.route("/team-points")
def team_points():
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", DEFAULT_ROUND, type=int)
    refresh = request.args.get("refresh", "false").lower() == "true"
    cache_key = f"data_team_points_{year}_{round_num}"
    if not refresh and cache_key in _data_cache:
        return jsonify(_data_cache[cache_key])
    if not refresh:
        disk = get_cached_result(cache_key)
        if disk:
            _data_cache[cache_key] = disk
            return jsonify(disk)

    try:
        openf1_result = _team_points_from_openf1(year, round_num)
        if openf1_result:
            _data_cache[cache_key] = openf1_result
            save_cached_result(cache_key, openf1_result)
            return jsonify(openf1_result)

        session = get_session(year, round_num)
        results = session.results

        df = results[["Position", "Abbreviation", "TeamName", "Points"]].copy()
        df["Position"] = pd.to_numeric(df["Position"], errors="coerce")
        df["Points"] = pd.to_numeric(df["Points"], errors="coerce")

        teams = (
            df.groupby("TeamName")["Points"]
            .sum()
            .reset_index()
            .sort_values("Points", ascending=False)
        )
        drivers = (
            df.sort_values("Position")[["Abbreviation", "TeamName", "Points", "Position"]]
            .head(10)
        )

        result = {
            "teams": teams.to_dict(orient="records"),
            "drivers": drivers.to_dict(orient="records"),
            "race": session.event["EventName"] if session.event is not None else f"{year} Round {round_num}",
            "dataSource": "FastF1",
        }
        _data_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@data_bp.route("/telemetry")
def telemetry():
    d1 = request.args.get("d1", "VER")
    d2 = request.args.get("d2", "LEC")
    resolution = request.args.get("resolution", "preview")  # "preview" or "full"

    # Preview = every 10th point (fast); Full = every 5th point (detailed)
    step = 10 if resolution == "preview" else TELEMETRY_STEP

    cache_key = f"data_telemetry_{d1}_{d2}_{resolution}"
    if cache_key in _data_cache: return jsonify(_data_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _data_cache[cache_key] = disk
        return jsonify(disk)

    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND, "Q")

        fastest_1 = session.laps.pick_driver(d1).pick_fastest()
        fastest_2 = session.laps.pick_driver(d2).pick_fastest()

        tel1 = fastest_1.get_telemetry().add_distance()
        tel2 = fastest_2.get_telemetry().add_distance()

        def _slice(series):
            return series.iloc[::step].tolist()

        result = {
            "d1": d1,
            "d2": d2,
            "resolution": resolution,
            "tel1": {
                "distance": _slice(tel1["Distance"]),
                "speed":    _slice(tel1["Speed"]),
                "throttle": _slice(tel1["Throttle"]),
                "brake":    _slice(tel1["Brake"].astype(int)),
            },
            "tel2": {
                "distance": _slice(tel2["Distance"]),
                "speed":    _slice(tel2["Speed"]),
                "throttle": _slice(tel2["Throttle"]),
                "brake":    _slice(tel2["Brake"].astype(int)),
            },
            "session": "2024 Bahrain Qualifying",
        }

        _data_cache[cache_key] = result
        save_cached_result(cache_key, result)

        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
