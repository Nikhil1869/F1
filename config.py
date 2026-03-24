import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(__file__)
CACHE_DIR = os.path.join(BASE_DIR, "fastf1_cache")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")

DEFAULT_YEAR = 2024
DEFAULT_ROUND = 1

BASELINE_RACE_LIMIT = 10
ADVANCED_RACE_LIMIT = 15
TEST_SIZE = 0.2
RANDOM_STATE = 42

TELEMETRY_STEP = 5


class Config:
    FLASK_APP = os.getenv("FLASK_APP", "app.py")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
