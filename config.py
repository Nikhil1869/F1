import os

CACHE_DIR = os.path.join(os.path.dirname(__file__), "fastf1_cache")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")

DEFAULT_YEAR = 2024
DEFAULT_ROUND = 1

BASELINE_RACE_LIMIT = 10
ADVANCED_RACE_LIMIT = 15
TEST_SIZE = 0.2
RANDOM_STATE = 42

# keep every Nth telemetry point to keep JSON payloads small
TELEMETRY_STEP = 5
