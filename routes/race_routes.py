import math
import time
import warnings

import pandas as pd
from flask import Blueprint, jsonify, request

from config import DEFAULT_YEAR
from services import fastf1_service, openf1_service

warnings.filterwarnings("ignore")

race_bp = Blueprint("race", __name__, url_prefix="/api/race")

TEAM_COLORS = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "Mercedes": "#27F4D2",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#FF87BC",
    "Williams": "#64C4FF",
    "RB": "#6692FF",
    "Kick Sauber": "#52E252",
    "Haas F1 Team": "#B6BABD",
}


def _race_session_key(year, round_num):
    for event in openf1_service.get_event_schedule(year):
        if event.get("round") == round_num:
            return event
    return None


@race_bp.route("/overview")
def overview():
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)

    event = _race_session_key(year, round_num)
    event_name = event.get("name") if event else f"Round {round_num}"
    country = event.get("country", "") if event else ""

    summary = {
        "year": year,
        "round": round_num,
        "eventName": event_name,
        "country": country,
        "winner": "N/A",
        "pole": "N/A",
        "fastestLap": "N/A",
        "gap": "N/A",
        "drivers": [],
        "source": "OpenF1",
    }

    try:
        if event and event.get("session_key"):
            results = openf1_service.get_race_results(event["session_key"])
            if results:
                podium = results[:3]
                summary["winner"] = podium[0]["driver"] if podium else "N/A"
                summary["drivers"] = results
                return jsonify(summary)

        session = fastf1_service.get_session(year, round_num, "R")
        results = session.results
        if not results.empty:
            ordered = results.sort_values("Position")
            winner = ordered.iloc[0]
            summary["winner"] = winner.get("Abbreviation", "N/A")
            summary["gap"] = str(ordered.iloc[1].get("Time", "N/A")) if len(ordered) > 1 else "N/A"
            summary["drivers"] = [
                {
                    "position": int(row["Position"]) if pd.notna(row.get("Position")) else 99,
                    "driver": row.get("Abbreviation", "N/A"),
                    "team": row.get("TeamName", "Unknown"),
                }
                for _, row in ordered.iterrows()
            ]
        fastest = session.laps.pick_fastest()
        if fastest is not None:
            summary["fastestLap"] = fastest.get("Driver", "N/A")
        summary["source"] = "FastF1"
        return jsonify(summary)
    except Exception as exc:
        return jsonify({"error": str(exc), **summary}), 500


@race_bp.route("/comparison")
def comparison():
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)
    session_type = request.args.get("session", "R")
    drivers = [d.strip().upper() for d in request.args.get("drivers", "VER,LEC").split(",") if d.strip()]
    drivers = drivers[:3]
    sample_rate = max(1, request.args.get("sample_rate", 8, type=int))

    if len(drivers) < 2:
        return jsonify({"error": "Select at least two drivers."}), 400

    try:
        session = fastf1_service.get_session_full(year, round_num, session_type)
        traces = {}
        reference_time = None

        for drv in drivers:
            laps = session.laps.pick_drivers(drv)
            if laps.empty:
                continue
            lap = laps.pick_fastest()
            tel = lap.get_telemetry().add_distance()
            if tel.empty:
                continue
            tel = tel.iloc[::sample_rate].copy()
            t = tel["Time"].dt.total_seconds().tolist() if "Time" in tel else list(range(len(tel)))
            if reference_time is None:
                reference_time = t
            traces[drv] = {
                "distance": [round(float(x), 2) for x in tel["Distance"].tolist()],
                "time": [round(float(x), 3) for x in t],
                "speed": [int(x) for x in tel["Speed"].tolist()],
                "throttle": [round(float(x), 1) for x in tel["Throttle"].tolist()],
                "brake": [int(x) for x in tel["Brake"].astype(int).tolist()],
                "gear": [int(x) for x in tel["nGear"].fillna(0).astype(int).tolist()] if "nGear" in tel else [],
                "lap": int(lap.get("LapNumber", 0)),
                "lapTime": str(lap.get("LapTime", "")),
                "team": session.get_driver(drv).get("TeamName", "Unknown"),
                "teamColor": TEAM_COLORS.get(session.get_driver(drv).get("TeamName", ""), "#FFFFFF"),
            }

        if len(traces) < 2:
            return jsonify({"error": "Could not load comparison telemetry for selected drivers."}), 404

        reference_driver = next(iter(traces.keys()))
        ref_dist = traces[reference_driver]["distance"]
        ref_time = traces[reference_driver]["time"]
        delta = {}
        for drv, trace in traces.items():
            if drv == reference_driver:
                delta[drv] = [0 for _ in ref_dist]
                continue
            paired = []
            for dist, ref_t in zip(ref_dist, ref_time):
                idx = min(range(len(trace["distance"])), key=lambda i: abs(trace["distance"][i] - dist))
                paired.append(round(trace["time"][idx] - ref_t, 3))
            delta[drv] = paired

        return jsonify({
            "year": year,
            "round": round_num,
            "session": session_type,
            "drivers": list(traces.keys()),
            "referenceDriver": reference_driver,
            "traces": traces,
            "delta": delta,
            "sampleRate": sample_rate,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@race_bp.route("/analysis")
def analysis():
    year = request.args.get("year", DEFAULT_YEAR, type=int)
    round_num = request.args.get("round", 1, type=int)

    try:
        session = fastf1_service.get_session(year, round_num, "R")
        laps = session.laps.copy()
        clean = laps[laps["LapTime"].notna()].copy()
        clean["LapTimeSeconds"] = clean["LapTime"].dt.total_seconds()
        sectors = {}
        for drv in clean["Driver"].dropna().unique()[:8]:
            d_laps = clean[clean["Driver"] == drv]
            sectors[drv] = {
                "sector1": round(float(d_laps["Sector1Time"].dt.total_seconds().median()), 3) if "Sector1Time" in d_laps else 0,
                "sector2": round(float(d_laps["Sector2Time"].dt.total_seconds().median()), 3) if "Sector2Time" in d_laps else 0,
                "sector3": round(float(d_laps["Sector3Time"].dt.total_seconds().median()), 3) if "Sector3Time" in d_laps else 0,
                "avgLap": round(float(d_laps["LapTimeSeconds"].median()), 3),
            }

        compounds = clean["Compound"].dropna().value_counts().to_dict() if "Compound" in clean else {}
        return jsonify({
            "year": year,
            "round": round_num,
            "eventName": session.event["EventName"] if session.event is not None else f"Round {round_num}",
            "sectorBreakdown": sectors,
            "compoundUsage": compounds,
            "totalLaps": int(clean["LapNumber"].max()) if not clean.empty else 0,
            "sampleNote": "FastF1 race lap data with cached fallback.",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@race_bp.route("/live/status")
def live_status():
    now = time.gmtime()
    is_weekend = now.tm_wday in {4, 5, 6}
    return jsonify({
        "live": is_weekend,
        "mode": "simulated",
        "message": "Simulated live mode is ready." if is_weekend else "No live F1 session detected; showing simulation.",
    })


@race_bp.route("/live/snapshot")
def live_snapshot():
    drivers = ["VER", "NOR", "LEC", "PIA", "SAI", "HAM", "RUS", "PER"]
    tick = int(time.time()) % 360
    rows = []
    for idx, drv in enumerate(drivers):
        angle = (tick * 0.03) + idx * (math.pi * 2 / len(drivers))
        rows.append({
            "position": idx + 1,
            "driver": drv,
            "gap": "Leader" if idx == 0 else f"+{round(idx * 1.7 + (tick % 7) * 0.08, 3)}s",
            "x": round(math.cos(angle), 3),
            "y": round(math.sin(angle), 3),
            "speed": 285 + ((tick + idx * 9) % 35),
        })
    return jsonify({"mode": "simulated", "updatedAt": int(time.time()), "leaderboard": rows})
