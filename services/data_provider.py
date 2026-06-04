"""
Unified data provider — routes data requests to FastF1 or OpenF1.

Strategy:
    - Schedule / Calendar  → OpenF1 first (fast HTTP), FastF1 fallback
    - Session listing      → OpenF1 first (fast HTTP), FastF1 fallback
    - Basic Results        → OpenF1 first (drivers + positions), FastF1 fallback
    - Telemetry / Replay   → FastF1 only (OpenF1 lacks XY position data)
    - ML Data Preparation  → FastF1 only (needs full session.results)
"""

import pandas as pd

from services import fastf1_service, openf1_service
from services.cache_service import get_cached_result, save_cached_result


# ── Country flag mapping (shared with calendar_routes) ───────────────────
COUNTRY_FLAGS = {
    "Bahrain": "🇧🇭", "Saudi Arabia": "🇸🇦", "Australia": "🇦🇺",
    "Japan": "🇯🇵", "China": "🇨🇳", "United States": "🇺🇸",
    "Italy": "🇮🇹", "Monaco": "🇲🇨", "Canada": "🇨🇦",
    "Spain": "🇪🇸", "Austria": "🇦🇹", "Great Britain": "🇬🇧",
    "United Kingdom": "🇬🇧", "Hungary": "🇭🇺", "Belgium": "🇧🇪",
    "Netherlands": "🇳🇱", "Singapore": "🇸🇬", "Mexico": "🇲🇽",
    "Brazil": "🇧🇷", "United Arab Emirates": "🇦🇪",
    "Abu Dhabi": "🇦🇪", "Qatar": "🇶🇦", "Azerbaijan": "🇦🇿",
    "France": "🇫🇷", "Portugal": "🇵🇹", "Turkey": "🇹🇷",
    "Russia": "🇷🇺", "Germany": "🇩🇪", "USA": "🇺🇸",
    "Miami": "🇺🇸", "Las Vegas": "🇺🇸", "Emilia Romagna": "🇮🇹",
}


def _get_flag(event_name, country):
    """Get flag emoji from event name or country."""
    if country in COUNTRY_FLAGS:
        return COUNTRY_FLAGS[country]
    name_lower = event_name.lower()
    for key, flag in COUNTRY_FLAGS.items():
        if key.lower() in name_lower:
            return flag
    return "🏁"


def _sort_events(events):
    return sorted(events, key=lambda event: event.get("date") or "")


class DataProvider:
    """Intelligently routes data requests to FastF1 or OpenF1."""

    # ── Schedule (OpenF1 first, FastF1 fallback) ─────────────────────

    def get_event_schedule(self, year: int):
        """
        Get the event schedule for a year.
        Returns a FastF1 EventSchedule DataFrame (routes depend on
        .iterrows() and specific column names).
        """
        # Always return FastF1 schedule — routes depend on its schema
        return fastf1_service.get_event_schedule(year)

    def get_event_schedule_fast(self, year: int):
        """
        Get a lightweight event schedule from OpenF1.
        Returns list of dicts with keys: round, name, country, date,
        meeting_key, session_key.

        Falls back to FastF1 if OpenF1 fails.
        """
        try:
            events = openf1_service.get_event_schedule(year)
            if events:
                return _sort_events(events)
        except Exception as exc:
            print(f"[DataProvider] OpenF1 schedule failed: {exc}")

        # Fallback: convert FastF1 schedule to same shape
        print("[DataProvider] Falling back to FastF1 for schedule")
        return self._fastf1_schedule_to_list(year)

    def _fastf1_schedule_to_list(self, year):
        """Convert a FastF1 schedule DataFrame to a list of dicts."""
        try:
            schedule = fastf1_service.get_event_schedule(year)
            events = []
            for _, event in schedule.iterrows():
                if event["EventFormat"] == "testing":
                    continue
                events.append({
                    "round": int(event["RoundNumber"]),
                    "name": event["EventName"],
                    "country": event.get("Country", ""),
                    "date": str(event.get("EventDate", ""))[:10],
                    "meeting_key": None,
                    "session_key": None,
                })
            return events
        except Exception as exc:
            print(f"[DataProvider] FastF1 schedule fallback failed: {exc}")
            return []

    # ── Session listing (for replay / laptimes dropdowns) ────────────

    def get_session_list(self, year: int, completed_only=True):
        """
        Get a list of sessions for dropdown population.
        Returns list of dicts: [{round, name, country, date}, ...]

        Uses OpenF1 first (instant), FastF1 fallback.
        """
        try:
            events = openf1_service.get_event_schedule(year)
            if events:
                events = _sort_events(events)
                if completed_only:
                    now = pd.Timestamp.now()
                    events = [
                        e for e in events
                        if e.get("date") and pd.Timestamp(e["date"]) < now
                    ]
                return events
        except Exception as exc:
            print(f"[DataProvider] OpenF1 session list failed: {exc}")

        # Fallback to FastF1
        print("[DataProvider] Falling back to FastF1 for session list")
        return self._fastf1_schedule_to_list(year)

    # ── Calendar with results (OpenF1 for structure + results) ───────

    def get_calendar_data(self, year: int):
        """
        Get full calendar with results for completed races.
        Uses OpenF1 for schedule structure AND race results.
        Falls back to FastF1 for everything if OpenF1 fails.

        Returns a dict matching the calendar route's response format:
        {year, races[], nextRace, completedRaces, totalRaces}
        """
        cache_key = f"dp_calendar_{year}"
        cached = get_cached_result(cache_key)
        if cached:
            return cached

        try:
            events = openf1_service.get_event_schedule(year)
            if events:
                events = _sort_events(events)
                result = self._build_calendar_from_openf1(year, events)
                if result:
                    save_cached_result(cache_key, result)
                    return result
        except Exception as exc:
            print(f"[DataProvider] OpenF1 calendar failed: {exc}")

        # Fallback — return None so the route uses its FastF1 path
        return None

    def _build_calendar_from_openf1(self, year, events):
        """Build calendar response from OpenF1 data."""
        now = pd.Timestamp.now()
        races = []
        next_race = None

        for ev in events:
            date_str = ev.get("date", "")
            country = ev.get("country", "")
            name = ev.get("name", "")
            flag = _get_flag(name, country)

            race_entry = {
                "round": ev["round"],
                "name": name,
                "country": country,
                "date": date_str,
                "flag": flag,
                "status": "upcoming",
                "winner": None,
                "podium": [],
            }

            is_past = date_str and pd.Timestamp(date_str) < now
            if is_past:
                race_entry["status"] = "completed"
                # Get results from OpenF1
                session_key = ev.get("session_key")
                if session_key:
                    results = openf1_service.get_race_results(session_key)
                    if results:
                        podium = results[:3]
                        race_entry["podium"] = [
                            {"driver": r["driver"], "team": r["team"]}
                            for r in podium
                        ]
                        race_entry["winner"] = podium[0]["driver"] if podium else "N/A"
                    else:
                        race_entry["winner"] = "N/A"
                else:
                    race_entry["winner"] = "N/A"
            else:
                if next_race is None:
                    race_entry["status"] = "next"
                    try:
                        event_dt = pd.Timestamp(date_str)
                        delta = (event_dt - now).total_seconds()
                        next_race = {
                            "round": ev["round"],
                            "name": name,
                            "country": country,
                            "flag": flag,
                            "date": date_str,
                            "countdownSeconds": max(0, int(delta)),
                        }
                    except Exception:
                        next_race = {
                            "round": ev["round"],
                            "name": name,
                            "country": country,
                            "flag": flag,
                            "date": date_str,
                            "countdownSeconds": 0,
                        }

            races.append(race_entry)

        completed_count = sum(1 for r in races if r["status"] == "completed")

        return {
            "year": year,
            "races": races,
            "nextRace": next_race,
            "completedRaces": completed_count,
            "totalRaces": len(races),
        }

    # ── Sessions (always FastF1 for telemetry) ───────────────────────

    def get_session(self, year: int, round_num: int, session_type: str = "R"):
        """Always FastF1 — needed for telemetry-heavy features."""
        return fastf1_service.get_session(year, round_num, session_type)

    def get_session_full(self, year: int, round_num: int, session_type: str = "R"):
        """Always FastF1 — needed for replay."""
        return fastf1_service.get_session_full(year, round_num, session_type)

    def load_sessions_concurrent(self, year, round_nums, session_type="R", max_workers=4):
        """Always FastF1 — needed for heavy data processing."""
        return fastf1_service.load_sessions_concurrent(
            year, round_nums, session_type, max_workers
        )


# Module-level singleton
provider = DataProvider()
