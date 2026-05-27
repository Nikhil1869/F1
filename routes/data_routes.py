import json
import os
import threading
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

import fastf1
import pandas as pd
from flask import Blueprint, jsonify, request

from config import CACHE_DIR, DEFAULT_YEAR, DEFAULT_ROUND, TELEMETRY_STEP

warnings.filterwarnings("ignore")

data_bp = Blueprint("data", __name__, url_prefix="/api/data")

os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

_session_cache = {}
_session_lock = threading.Lock()

# ── Persistent JSON disk cache ──────────────────────────────────────────
_API_CACHE_DIR = os.path.join(CACHE_DIR, "api_results")
os.makedirs(_API_CACHE_DIR, exist_ok=True)


def get_cached_result(cache_key):
    """Read a previously-saved JSON result from disk."""
    path = os.path.join(_API_CACHE_DIR, f"{cache_key}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None


def save_cached_result(cache_key, data):
    """Persist a JSON-serialisable result to disk."""
    path = os.path.join(_API_CACHE_DIR, f"{cache_key}.json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass


# ── Session loading (thread-safe) ───────────────────────────────────────
def get_session(year, round_num, session_type="R"):
    key = (year, round_num, session_type)
    with _session_lock:
        if key in _session_cache:
            return _session_cache[key]
    # Load outside the lock (I/O bound)
    session = fastf1.get_session(year, round_num, session_type)
    session.load(
        telemetry=(session_type == "Q"),
        weather=False,
        messages=False,
    )
    with _session_lock:
        _session_cache[key] = session
    return session


def load_sessions_concurrent(year, round_nums, session_type="R", max_workers=4):
    """Load multiple sessions in parallel. Returns {round_num: session}."""
    results = {}

    def _load(rnd):
        return rnd, get_session(year, rnd, session_type)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_load, rnd): rnd for rnd in round_nums}
        for future in as_completed(futures):
            try:
                rnd, session = future.result()
                results[rnd] = session
            except Exception:
                pass
    return results


@data_bp.route("/team-points")
def team_points():
    cache_key = "data_team_points"
    if cache_key in _session_cache: return jsonify(_session_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _session_cache[cache_key] = disk
        return jsonify(disk)
        
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

        result = {
            "teams": teams.to_dict(orient="records"),
            "drivers": drivers.to_dict(orient="records"),
            "race": "2024 Bahrain Grand Prix",
        }
        _session_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@data_bp.route("/telemetry")
def telemetry():
    d1 = request.args.get("d1", "VER")
    d2 = request.args.get("d2", "LEC")
    
    cache_key = f"data_telemetry_{d1}_{d2}"
    if cache_key in _session_cache: return jsonify(_session_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _session_cache[cache_key] = disk
        return jsonify(disk)
        
    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND, "Q")

        fastest_1 = session.laps.pick_driver(d1).pick_fastest()
        fastest_2 = session.laps.pick_driver(d2).pick_fastest()

        tel1 = fastest_1.get_telemetry().add_distance()
        tel2 = fastest_2.get_telemetry().add_distance()

        step = TELEMETRY_STEP

        def _slice(series):
            return series.iloc[::step].tolist()

        result = {
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
        }
        
        _session_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
