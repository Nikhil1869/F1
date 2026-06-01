import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(__file__)
CACHE_DIR = os.path.join(BASE_DIR, "fastf1_cache")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

# ── Cache sub-directories ───────────────────────────────────────────────
API_CACHE_DIR = os.path.join(CACHE_DIR, "api_results")
REPLAY_CACHE_DIR = os.path.join(CACHE_DIR, "replay_cache")

# ── Defaults ────────────────────────────────────────────────────────────
DEFAULT_YEAR = 2024
DEFAULT_ROUND = 1

# ── ML constants ────────────────────────────────────────────────────────
BASELINE_RACE_LIMIT = 10
ADVANCED_RACE_LIMIT = 15
TEST_SIZE = 0.2
RANDOM_STATE = 42

# ── Telemetry ───────────────────────────────────────────────────────────
TELEMETRY_STEP = 5

# ── OpenF1 API ──────────────────────────────────────────────────────────
OPENF1_BASE_URL = os.getenv("OPENF1_BASE_URL", "https://api.openf1.org/v1")
OPENF1_TIMEOUT = int(os.getenv("OPENF1_TIMEOUT", "10"))

# ── Data source preference ──────────────────────────────────────────────
# "auto" = OpenF1 for schedule, FastF1 for telemetry
# "fastf1" = always FastF1
# "openf1" = prefer OpenF1 where possible
DATA_SOURCE_PREFER = os.getenv("DATA_SOURCE_PREFER", "auto")


class Config:
    FLASK_APP = os.getenv("FLASK_APP", "app.py")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
