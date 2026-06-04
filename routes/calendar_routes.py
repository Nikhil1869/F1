import warnings
from datetime import datetime

import pandas as pd
from flask import Blueprint, jsonify, request

from services.data_provider import provider, _get_flag
from services.fastf1_service import load_sessions_concurrent
from services.cache_service import get_cached_result, save_cached_result

warnings.filterwarnings("ignore")

calendar_bp = Blueprint("calendar", __name__, url_prefix="/api/calendar")

_calendar_cache = {}


@calendar_bp.route("/season")
def season_calendar():
    """Full season calendar with results for completed races."""
    year = request.args.get("year", 2024, type=int)

    cache_key = f"calendar_{year}"

    # 1. Hot in-memory cache
    if cache_key in _calendar_cache:
        return jsonify(_calendar_cache[cache_key])

    # 2. Persistent disk cache
    disk = get_cached_result(cache_key)
    if disk:
        _calendar_cache[cache_key] = disk
        return jsonify(disk)

    # 3. Try OpenF1 via DataProvider (fast — no FastF1 session loading)
    try:
        openf1_result = provider.get_calendar_data(year)
        if openf1_result:
            _calendar_cache[cache_key] = openf1_result
            save_cached_result(cache_key, openf1_result)
            return jsonify(openf1_result)
    except Exception as exc:
        print(f"[Calendar] OpenF1 path failed: {exc}")

    # 4. Fallback: compute from FastF1 (slower — loads sessions)
    try:
        schedule = provider.get_event_schedule(year)
        now = pd.Timestamp.now()

        all_events = []
        completed_rounds = []
        for _, event in schedule.iterrows():
            if event["EventFormat"] == "testing":
                continue
            all_events.append(event)
            event_date = event.get("EventDate", None)
            if event_date is not None and event_date < now:
                completed_rounds.append(int(event["RoundNumber"]))

        # Load ALL completed race sessions concurrently
        sessions = load_sessions_concurrent(year, completed_rounds, max_workers=4)

        races = []
        next_race = None

        for event in all_events:
            round_num = int(event["RoundNumber"])
            event_name = event["EventName"]
            country = event.get("Country", "")
            event_date = event.get("EventDate", None)
            flag = _get_flag(event_name, country)

            date_str = str(event_date)[:10] if event_date is not None else ""

            race_entry = {
                "round": round_num,
                "name": event_name,
                "country": country,
                "date": date_str,
                "flag": flag,
                "status": "upcoming",
                "winner": None,
                "podium": [],
            }

            if event_date is not None and event_date < now:
                race_entry["status"] = "completed"
                session = sessions.get(round_num)
                if session is not None:
                    try:
                        results = session.results.copy()
                        results["Position"] = pd.to_numeric(results["Position"], errors="coerce")
                        results = results.sort_values("Position")

                        top3 = results.head(3)
                        podium = []
                        for _, row in top3.iterrows():
                            podium.append({
                                "driver": row.get("Abbreviation", "???"),
                                "team": row.get("TeamName", "Unknown"),
                            })

                        race_entry["winner"] = podium[0]["driver"] if podium else None
                        race_entry["podium"] = podium
                    except Exception:
                        race_entry["winner"] = "N/A"
                else:
                    race_entry["winner"] = "N/A"
            else:
                if next_race is None:
                    race_entry["status"] = "next"
                    try:
                        event_dt = pd.Timestamp(event_date)
                        delta = (event_dt - now).total_seconds()
                        next_race = {
                            "round": round_num,
                            "name": event_name,
                            "country": country,
                            "flag": flag,
                            "date": date_str,
                            "countdownSeconds": max(0, int(delta)),
                        }
                    except Exception:
                        next_race = {
                            "round": round_num,
                            "name": event_name,
                            "country": country,
                            "flag": flag,
                            "date": date_str,
                            "countdownSeconds": 0,
                        }

            races.append(race_entry)

        completed_count = sum(1 for r in races if r["status"] == "completed")
        total_races = len(races)

        result = {
            "year": year,
            "races": races,
            "nextRace": next_race,
            "completedRaces": completed_count,
            "totalRaces": total_races,
        }

        _calendar_cache[cache_key] = result
        save_cached_result(cache_key, result)
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
