# F1 Data Lab & Race Replay

Interactive Formula 1 data analysis platform with telemetry visualization, ML-based podium predictions, a chatbot-style race engineer, and a fully interactive 2D race replay engine.

![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.x-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)

## What it does

- **Race Data Analysis** — Pull constructor and driver standings from any race using the FastF1 API
- **Telemetry Comparison** — Overlay speed, throttle, and brake traces for two drivers from qualifying
- **ML Podium Prediction (Baseline)** — Random Forest trained on season data to predict podium finishes
- **ML Podium Prediction (Advanced)** — Adds cumulative driver form + hyperparameter tuning via GridSearchCV
- **AI Race Engineer** — Chat interface to query race winners, fastest laps, and standings from historical data
- **Interactive Race Replay** — 2D visualization of any race session with real-time driver positions, telemetry streaming, dynamic leaderboards, and safety car tracking

## Project structure

```
f1/
├── app.py                          # Main Flask application entry point
├── config.py                       # Shared configuration and environment settings
├── requirements.txt
├── routes/                         # API Blueprints
│   ├── data_routes.py              # Baseline data routes
│   ├── ml_routes.py                # Machine learning prediction routes
│   ├── chat_routes.py              # AI Race Engineer routes
│   └── replay_routes.py            # Race replay and telemetry routes
├── templates/
│   ├── index.html                  # Main F1 Data Lab dashboard
│   └── replay.html                 # Interactive Race Replay viewer
├── static/
│   ├── css/
│   │   ├── style.css               # Main dashboard styling
│   │   └── replay.css              # Replay engine styling
│   └── js/
│       ├── app.js                  # Main dashboard logic
│       └── replay.js               # Replay rendering and playback logic
├── part_1_pandas/
│   └── 01_f1_data_basics.py        # Standalone script — data loading & bar chart
├── part_2_fastf1/
│   └── 02_telemetry.py             # Standalone script — qualifying telemetry plot
├── part_3_ml_baseline/
│   └── 03_ml_model.py              # Standalone script — baseline Random Forest
├── part_4_ml_advanced/
│   └── 04_ml_advanced.py           # Standalone script — tuned RF + feature engineering
├── part_5_ai_engineer/
│   └── 05_ai_race_engineer.py      # Standalone script — chatbot skeleton
└── fastf1_cache/                   # Cached telemetry data (ignored in git)
```

## Getting started

### Prerequisites

- Python 3.9 or higher
- pip

### Installation

```bash
git clone https://github.com/Nikhil1869/F1.git
cd F1

python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Running the web app

Create an `.env` file based on `.env.example` to unlock the AI Engineer functionalities.

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser. From there, you can explore the F1 Data Lab or launch the new **Race Replay** interface.

> **Note:** The first load of any race or qualifying session takes a minute or two while FastF1 downloads and caches the required telemetry data. Subsequent loads are significantly faster.

### Running the standalone scripts

Each `part_*` folder contains a self-contained script you can run independently:

```bash
python part_1_pandas/01_f1_data_basics.py
python part_2_fastf1/02_telemetry.py
python part_3_ml_baseline/03_ml_model.py
python part_4_ml_advanced/04_ml_advanced.py
python part_5_ai_engineer/05_ai_race_engineer.py
```

## Tech stack

| Layer     | Tools                                        |
|-----------|----------------------------------------------|
| Data      | [FastF1](https://github.com/theOehrly/Fast-F1), pandas, numpy |
| ML        | scikit-learn (RandomForestClassifier, GridSearchCV) |
| Backend   | Flask (Blueprints)                           |
| Frontend  | Vanilla JS, Chart.js, HTML5 Canvas, CSS      |
| Plots     | matplotlib, seaborn (standalone scripts)     |

## API endpoints

| Method | Route                       | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | `/api/part1/team-points`    | Constructor + driver points        |
| GET    | `/api/part2/telemetry`      | Speed/throttle/brake telemetry     |
| GET    | `/api/part3/predict`        | Baseline ML predictions            |
| GET    | `/api/part4/predict-advanced` | Advanced ML predictions          |
| POST   | `/api/part5/chat`           | AI Race Engineer chat              |
| GET    | `/api/replay/sessions`      | List available replay sessions     |
| GET    | `/api/replay/load`          | Load full race telemetry and track |

## License

MIT — see [LICENSE](LICENSE) for details.
