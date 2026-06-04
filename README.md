# F1 Data Lab

Modern Formula 1 analytics app with fast OpenF1-backed session data, cached FastF1 telemetry, lazy race replay loading, driver comparison charts, ML predictions, and a simulated live dashboard.

## Tech Stack

- Backend: Flask, Flask-Login, Flask-SQLAlchemy, optional Flask-SocketIO
- Data: OpenF1 for fast public session/results data, FastF1 for detailed telemetry
- ML: scikit-learn, XGBoost
- Frontend: HTML, CSS, vanilla JavaScript, Chart.js, Canvas/Web Worker replay
- Deployment: Docker, Render/Railway-ready process files

## Highlights

- Replay page loads basic race metadata first, then loads telemetry only on demand.
- Telemetry is sampled, chunked, cached in `fastf1_cache/`, and precomputed into `precomputed/`.
- Race workspace tabs: Overview, Telemetry Replay, Comparison, Analysis.
- Comparison supports 2-3 drivers with speed, throttle, brake, and delta charts.
- Analysis tab includes sector breakdown, compound usage, and simulated live leaderboard.
- Session list, basic results, calendar, and driver lists prefer OpenF1 for speed with FastF1 fallback.

## Local Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000`.

The first detailed telemetry build can take time while FastF1 fills the disk cache. Repeat loads are much faster.

## Docker

```bash
docker build -t f1-data-lab .
docker run -p 5000:5000 f1-data-lab
```

## Environment

```env
FLASK_APP=app.py
FLASK_ENV=production
SECRET_KEY=change-me
OPENF1_BASE_URL=https://api.openf1.org/v1
OPENF1_TIMEOUT=10
DATA_SOURCE_PREFER=auto
```

## Core API

- `GET /api/replay/basic` - fast OpenF1 replay metadata
- `GET /api/replay/telemetry` - sampled chunked FastF1 telemetry
- `GET /api/race/overview` - race summary
- `GET /api/race/comparison` - 2-3 driver telemetry comparison
- `GET /api/race/analysis` - sector and compound analysis
- `GET /api/race/live/status` - live/simulation state
- `GET /api/race/live/snapshot` - simulated live leaderboard

## Deployment

Render and Railway can run the app with:

```bash
gunicorn app:app
```

For SocketIO/eventlet deployments, use:

```bash
gunicorn --worker-class eventlet -w 1 app:app
```

## Project Layout

```text
app.py
config.py
routes/
services/
static/
templates/
precomputed/
fastf1_cache/
```

## Notes

Learning scripts were archived onto `codex/learning-folders-archive` before cleanup from the active branch.
