import os
import warnings

import fastf1
import pandas as pd
from flask import Blueprint, jsonify, request

from config import CACHE_DIR, DEFAULT_YEAR, DEFAULT_ROUND, TELEMETRY_STEP

warnings.filterwarnings("ignore")

data_bp = Blueprint("data", __name__, url_prefix="/api/data")

os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

_session_cache = {}


def get_session(year, round_num, session_type="R"):
    key = (year, round_num, session_type)
    if key not in _session_cache:
        session = fastf1.get_session(year, round_num, session_type)
        session.load(
            telemetry=(session_type == "Q"),
            weather=False,
            messages=False,
        )
        _session_cache[key] = session
    return _session_cache[key]


@data_bp.route("/team-points")
def team_points():
    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND)
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

        return jsonify({
            "teams": teams.to_dict(orient="records"),
            "drivers": drivers.to_dict(orient="records"),
            "race": "2024 Bahrain Grand Prix",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@data_bp.route("/telemetry")
def telemetry():
    d1 = request.args.get("d1", "VER")
    d2 = request.args.get("d2", "LEC")
    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND, "Q")

        fastest_1 = session.laps.pick_driver(d1).pick_fastest()
        fastest_2 = session.laps.pick_driver(d2).pick_fastest()

        tel1 = fastest_1.get_telemetry().add_distance()
        tel2 = fastest_2.get_telemetry().add_distance()

        step = TELEMETRY_STEP

        def _slice(series):
            return series.iloc[::step].tolist()

        return jsonify({
            "d1": d1,
            "d2": d2,
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
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
