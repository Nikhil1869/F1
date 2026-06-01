"""
FastF1 service — single place for ALL FastF1 API interactions.

No route file should ever `import fastf1` directly; they use this module.
"""

import os
import threading
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

import fastf1
import pandas as pd

from config import CACHE_DIR

warnings.filterwarnings("ignore")

# ── Cache initialisation ────────────────────────────────────────────────

_cache_initialised = False


def init_cache(cache_dir: str = None):
    """Enable FastF1 disk cache. Must be called once before any data load."""
    global _cache_initialised
    if _cache_initialised:
        return
    d = cache_dir or CACHE_DIR
    os.makedirs(d, exist_ok=True)
    fastf1.Cache.enable_cache(d)
    _cache_initialised = True


# ── Thread-safe session cache ───────────────────────────────────────────

_session_cache = {}
_session_lock = threading.Lock()


def get_session(year, round_num, session_type="R"):
    """
    Load a FastF1 session (thread-safe, in-memory cached).

    Parameters
    ----------
    year : int
    round_num : int
    session_type : str  ("R", "Q", "FP1", etc.)
    """
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


def get_session_full(year, round_num, session_type="R"):
    """
    Load a FastF1 session with ALL data (telemetry + weather + messages).
    Used by the replay system.
    """
    key = (year, round_num, session_type, "full")
    with _session_lock:
        if key in _session_cache:
            return _session_cache[key]

    session = fastf1.get_session(year, round_num, session_type)
    session.load(telemetry=True, weather=True, messages=True)
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


# ── Schedule helpers ────────────────────────────────────────────────────

def get_event_schedule(year):
    """
    Return the full FastF1 event schedule for a year.
    Returns the raw FastF1 EventSchedule DataFrame.
    """
    return fastf1.get_event_schedule(year)


def get_completed_events(year):
    """
    Return only completed (non-testing, past-date) events as a list of dicts.
    """
    schedule = get_event_schedule(year)
    completed = []
    now = pd.Timestamp.now()
    for _, event in schedule.iterrows():
        if event["EventFormat"] == "testing":
            continue
        if event["EventDate"] > now:
            continue
        completed.append(event)
    return completed


def get_all_race_events(year):
    """
    Return all non-testing events (completed + upcoming) as list of Series.
    """
    schedule = get_event_schedule(year)
    events = []
    for _, event in schedule.iterrows():
        if event["EventFormat"] != "testing":
            events.append(event)
    return events


def _normalise_replay_session_key(session_key, round_num=None, session_type="R"):
    """
    Convert the replay session key used by routes into FastF1 arguments.

    Accepted forms:
        (year, round_num)
        (year, round_num, session_type)
        {"year": 2024, "round": 1, "session": "R"}
        year, round_num, session_type positional arguments
    """
    if isinstance(session_key, dict):
        year = session_key.get("year")
        round_value = session_key.get("round") or session_key.get("round_num")
        session_value = session_key.get("session") or session_key.get("session_type") or session_type
    elif isinstance(session_key, (tuple, list)):
        if len(session_key) < 2:
            raise ValueError("Replay session key must include year and round")
        year = session_key[0]
        round_value = session_key[1]
        session_value = session_key[2] if len(session_key) > 2 else session_type
    else:
        year = session_key
        round_value = round_num
        session_value = session_type

    if year is None or round_value is None:
        raise ValueError("FastF1 replay telemetry requires year and round")

    return int(year), int(round_value), str(session_value or "R")


def get_sampled_telemetry(session_key, round_num=None, session_type="R", sample_rate=5):
    """
    Load a replay session and return the sampling rate to apply downstream.

    FastF1 still needs the full session object for per-driver telemetry extraction,
    so sampling is applied by the replay route when it builds the shared timeline.
    """
    year, round_value, session_value = _normalise_replay_session_key(
        session_key, round_num, session_type
    )
    sample_rate = max(1, int(sample_rate or 1))
    session = get_session_full(year, round_value, session_value)
    return session, sample_rate
