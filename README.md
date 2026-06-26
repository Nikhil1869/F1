# F1 Data Lab 🏎️

A modern Formula 1 analytics platform featuring real-time race data, telemetry replay, driver comparisons, ML predictions, and fantasy league tools — powered by a Flask API backend and a Next.js frontend.

## Features

| Page | Description |
|---|---|
| **Dashboard** | Season overview, upcoming race, latest results |
| **Race Replay** | Canvas-based race replay with sampled telemetry data |
| **Telemetry** | Detailed speed / throttle / brake / gear traces |
| **Lap Times** | Lap-by-lap analysis with compound visualisation |
| **Head-to-Head** | Side-by-side driver comparison across a season |
| **Strategy** | Pit-stop strategy Gantt chart and tyre analysis |
| **Radar** | Multi-metric driver radar charts |
| **Predictions** | ML race-result predictions (scikit-learn / XGBoost) |
| **Calendar** | Season calendar with weather data |
| **Fantasy** | Fantasy team builder with projected points |
| **AI Chat** | Ask questions about race data via LLM integration |

## Tech Stack

- **Backend**: Flask, Flask-Login, Flask-SQLAlchemy, Flask-SocketIO
- **Data**: [OpenF1](https://openf1.org) (fast session/results), [FastF1](https://docs.fastf1.dev) (detailed telemetry)
- **ML**: scikit-learn, XGBoost
- **Frontend**: Next.js 16, React 19, Recharts, Framer Motion, Tailwind CSS 4
- **Deployment**: Docker, Render / Railway ready

## Project Layout

```text
├── app.py                 # Flask application entry point
├── config.py              # Configuration & environment variables
├── models.py              # SQLAlchemy models (User, SeasonResult, SavedReplay)
├── backfill.py            # Script to backfill season results into DB
├── requirements.txt       # Python dependencies
├── Dockerfile             # Container build
├── docker-compose.yml     # Local Docker orchestration
├── Procfile               # Heroku / Railway process file
├── render.yaml            # Render deployment config
│
├── routes/                # Flask API route blueprints
│   ├── data_routes.py     #   Core data endpoints
│   ├── ml_routes.py       #   ML prediction endpoints
│   ├── replay_routes.py   #   Race replay endpoints
│   ├── calendar_routes.py #   Season calendar
│   ├── race_routes.py     #   Race overview / comparison / analysis
│   ├── h2h_routes.py      #   Head-to-head comparison
│   ├── laptimes_routes.py #   Lap time analysis
│   ├── strategy_routes.py #   Pit strategy
│   ├── radar_routes.py    #   Radar chart data
│   ├── season_routes.py   #   Season standings
│   ├── fantasy_routes.py  #   Fantasy league
│   ├── chat_routes.py     #   AI chat
│   ├── auth_routes.py     #   Authentication
│   └── async_routes.py    #   Async session loading
│
├── services/              # Business logic & external API clients
│   ├── fastf1_service.py  #   FastF1 wrapper with caching & async loading
│   ├── openf1_service.py  #   OpenF1 REST client
│   ├── data_provider.py   #   Unified data layer (auto-selects source)
│   └── cache_service.py   #   In-memory & disk cache utilities
│
├── ml_models/             # Machine learning models
│   └── tyre_model.py      #   Tyre degradation prediction
│
├── frontend/              # Next.js frontend application
│   ├── src/app/           #   App Router pages
│   ├── src/components/    #   Reusable UI components
│   ├── src/hooks/         #   Custom React hooks
│   ├── src/lib/           #   API client & constants
│   └── package.json       #   Node dependencies
│
├── fastf1_cache/          # FastF1 disk cache (gitignored, auto-created)
└── precomputed/           # Pre-computed race data (gitignored, auto-created)
```

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+ (for the frontend)

### Backend

```bash
# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your SECRET_KEY and optional LLM_API_KEY

# Run the Flask server
python app.py
```

The API will be available at `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs at `http://localhost:3000` and proxies API calls to the Flask backend.

### Docker

```bash
docker compose up --build
```

### Backfill Season Data

```bash
python backfill.py 2024
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FLASK_APP` | `app.py` | Flask entry point |
| `FLASK_ENV` | `development` | Environment mode |
| `SECRET_KEY` | `dev-secret-key` | Flask session secret |
| `LLM_API_KEY` | *(empty)* | API key for AI chat feature |
| `OPENF1_BASE_URL` | `https://api.openf1.org/v1` | OpenF1 API base URL |
| `OPENF1_TIMEOUT` | `10` | OpenF1 request timeout (seconds) |
| `DATA_SOURCE_PREFER` | `auto` | Data source strategy: `auto`, `fastf1`, `openf1` |

## API Endpoints

### Race & Replay
- `GET /api/replay/basic` — Fast OpenF1 replay metadata
- `GET /api/replay/telemetry` — Sampled chunked FastF1 telemetry
- `GET /api/race/overview` — Race summary
- `GET /api/race/comparison` — 2–3 driver telemetry comparison
- `GET /api/race/analysis` — Sector and compound analysis

### Data & Predictions
- `GET /api/standings` — Current season standings
- `GET /api/calendar` — Season calendar with weather
- `POST /api/predict/race` — ML race prediction
- `GET /api/radar/drivers` — Driver radar chart data

### Live (Simulated)
- `GET /api/race/live/status` — Live / simulation state
- `GET /api/race/live/snapshot` — Simulated live leaderboard

## Deployment

**Render** — push to GitHub; the `render.yaml` auto-configures.

**Railway / Heroku** — uses the `Procfile`:
```bash
gunicorn app:app
```

For SocketIO (eventlet):
```bash
gunicorn --worker-class eventlet -w 1 app:app
```

## Notes

- The first detailed telemetry load can be slow while FastF1 fills its disk cache. Subsequent loads are much faster.
- Learning scripts were archived onto the `codex/learning-folders-archive` branch.

## License

[MIT](LICENSE)
