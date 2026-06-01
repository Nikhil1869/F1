"""
OpenF1 service — lightweight REST API client for live / schedule data.

API docs: https://openf1.org
Base URL: https://api.openf1.org/v1

Used as a fast alternative to FastF1 for schedule/calendar queries
and basic session info. Does NOT provide detailed telemetry XY coordinates.
"""

import time
import threading
import requests

from config import OPENF1_BASE_URL, OPENF1_TIMEOUT
from services.cache_service import get_cached_result, save_cached_result


# ── In-memory response cache with TTL ────────────────────────────────────
_response_cache = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 300  # 5 minutes


def _get_mem_cache(key):
    with _cache_lock:
        entry = _response_cache.get(key)
        if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
            return entry["data"]
    return None


def _set_mem_cache(key, data):
    with _cache_lock:
        _response_cache[key] = {"data": data, "ts": time.time()}


def _get(endpoint, params=None):
    """
    Make a GET request to the OpenF1 API.

    Returns parsed JSON list/dict on success, empty list on failure.
    """
    url = f"{OPENF1_BASE_URL}/{endpoint}"
    try:
        resp = requests.get(url, params=params, timeout=OPENF1_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"[OpenF1] Error fetching {endpoint}: {exc}")
        return []


# ── Meetings & Sessions ─────────────────────────────────────────────────

def get_meetings(year: int):
    """
    List all meetings (race weekends) for a year.
    Returns list of dicts with keys:
        meeting_key, meeting_name, meeting_official_name,
        location, country_name, date_start, year, ...
    """
    cache_key = f"openf1_meetings_{year}"

    # 1. In-memory cache
    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    # 2. Disk cache
    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    # 3. API call
    data = _get("meetings", {"year": year})
    if data:
        save_cached_result(cache_key, data)
        _set_mem_cache(cache_key, data)
    return data


def get_sessions(meeting_key=None, year=None, session_type=None):
    """
    List sessions. Filter by meeting_key, year, and/or session_type.
    session_type examples: "Race", "Qualifying", "Practice 1", etc.
    """
    params = {}
    if meeting_key:
        params["meeting_key"] = meeting_key
    if year:
        params["year"] = year
    if session_type:
        params["session_type"] = session_type

    cache_key = f"openf1_sessions_{meeting_key}_{year}_{session_type}"
    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    data = _get("sessions", params)
    if data:
        save_cached_result(cache_key, data)
        _set_mem_cache(cache_key, data)
    return data


# ── Drivers ──────────────────────────────────────────────────────────────

def get_drivers(session_key: int):
    """
    Get all drivers for a session.
    Returns list of dicts with keys:
        driver_number, broadcast_name, full_name, name_acronym,
        team_name, team_colour, ...
    """
    cache_key = f"openf1_drivers_{session_key}"
    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    data = _get("drivers", {"session_key": session_key})
    if data:
        # Deduplicate by driver_number (API can return multiple entries)
        seen = {}
        for d in data:
            seen[d.get("driver_number")] = d
        data = list(seen.values())
        save_cached_result(cache_key, data)
        _set_mem_cache(cache_key, data)
    return data


# ── Positions ────────────────────────────────────────────────────────────

def get_positions(session_key: int, driver_number=None):
    """Get position data for a session."""
    params = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return _get("position", params)


def get_final_positions(session_key: int):
    """
    Get the final position of each driver at the end of a session.
    Returns a dict: {driver_number: final_position}
    """
    cache_key = f"openf1_final_pos_{session_key}"
    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    positions = get_positions(session_key)
    if not positions:
        return {}

    # Take the last position entry for each driver
    final = {}
    for p in positions:
        dn = p.get("driver_number")
        pos = p.get("position")
        if dn is not None and pos is not None:
            final[dn] = pos

    save_cached_result(cache_key, final)
    _set_mem_cache(cache_key, final)
    return final


# ── Laps ─────────────────────────────────────────────────────────────────

def get_laps(session_key: int, driver_number=None):
    """Get lap data for a session."""
    params = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return _get("laps", params)


# ── Stints ───────────────────────────────────────────────────────────────

def get_stints(session_key: int, driver_number=None):
    """Get stint (tyre) data for a session."""
    params = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return _get("stints", params)


# ── Race Control ─────────────────────────────────────────────────────────

def get_race_control(session_key: int):
    """Get race control messages (flags, penalties, etc.)."""
    return _get("race_control", {"session_key": session_key})


# ── Weather ──────────────────────────────────────────────────────────────

def get_weather(session_key: int):
    """Get weather data for a session."""
    return _get("weather", {"session_key": session_key})


# ── Schedule helper ──────────────────────────────────────────────────────

def get_event_schedule(year: int):
    """
    Build an event schedule from OpenF1 meetings + sessions data.

    Returns a list of dicts with normalised keys:
        round, name, country, date, meeting_key, session_key
    """
    cache_key = f"openf1_schedule_{year}"

    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    meetings = get_meetings(year)
    if not meetings:
        return []

    events = []
    round_num = 0
    for m in meetings:
        meeting_name = m.get("meeting_name", "")
        if "test" in meeting_name.lower() or "pre-season" in meeting_name.lower():
            continue

        round_num += 1

        # Try to find the Race session for this meeting
        race_sessions = get_sessions(
            meeting_key=m.get("meeting_key"),
            session_type="Race"
        )
        session_key = race_sessions[0].get("session_key") if race_sessions else None

        events.append({
            "round": round_num,
            "name": meeting_name,
            "country": m.get("country_name", ""),
            "date": m.get("date_start", "")[:10] if m.get("date_start") else "",
            "meeting_key": m.get("meeting_key"),
            "session_key": session_key,
        })

    if events:
        save_cached_result(cache_key, events)
        _set_mem_cache(cache_key, events)
    return events


# ── Race results (aggregate) ─────────────────────────────────────────────

def get_race_results(session_key: int):
    """
    Get normalised race results for a session.

    Returns a list of dicts sorted by position:
        [{"position": 1, "driver": "VER", "team": "Red Bull", "driver_number": 1}, ...]
    """
    cache_key = f"openf1_race_results_{session_key}"
    mem = _get_mem_cache(cache_key)
    if mem:
        return mem

    cached = get_cached_result(cache_key)
    if cached:
        _set_mem_cache(cache_key, cached)
        return cached

    drivers = get_drivers(session_key)
    final_positions = get_final_positions(session_key)

    if not drivers or not final_positions:
        return []

    # Build driver_number -> info map
    driver_map = {}
    for d in drivers:
        dn = d.get("driver_number")
        driver_map[dn] = {
            "driver": d.get("name_acronym", "???"),
            "team": d.get("team_name", "Unknown"),
            "full_name": d.get("full_name", ""),
            "driver_number": dn,
        }

    results = []
    for dn, pos in final_positions.items():
        info = driver_map.get(dn, {
            "driver": "???",
            "team": "Unknown",
            "full_name": "",
            "driver_number": dn
        })
        results.append({
            "position": pos,
            "driver": info["driver"],
            "team": info["team"],
            "full_name": info.get("full_name", ""),
            "driver_number": dn,
        })

    results.sort(key=lambda x: x["position"])

    save_cached_result(cache_key, results)
    _set_mem_cache(cache_key, results)
    return results
