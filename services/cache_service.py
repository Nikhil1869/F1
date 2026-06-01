"""
Centralised caching layer — disk (JSON) + in-memory dict.

Every route that previously imported get_cached_result / save_cached_result
from data_routes should now import from here.
"""

import json
import os
import threading

from config import CACHE_DIR

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


# ── Thread-safe in-memory cache ─────────────────────────────────────────
class MemoryCache:
    """Simple thread-safe dict wrapper used by route modules."""

    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()

    def get(self, key, default=None):
        with self._lock:
            return self._store.get(key, default)

    def set(self, key, value):
        with self._lock:
            self._store[key] = value

    def __contains__(self, key):
        with self._lock:
            return key in self._store

    def __getitem__(self, key):
        with self._lock:
            return self._store[key]

    def __setitem__(self, key, value):
        with self._lock:
            self._store[key] = value
