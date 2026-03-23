# F1 Data Lab

Interactive Formula 1 data analysis platform with telemetry visualization, ML-based podium predictions, and a chatbot-style race engineer.

![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.x-green.svg)
![License](https://img.shields.io/badge/license-MIT-yellow.svg)

## What it does

- **Race Data Analysis** — Pull constructor and driver standings from any race using the FastF1 API
- **Telemetry Comparison** — Overlay speed, throttle, and brake traces for two drivers from qualifying
- **ML Podium Prediction (Baseline)** — Random Forest trained on season data to predict podium finishes
- **ML Podium Prediction (Advanced)** — Adds cumulative driver form + hyperparameter tuning via GridSearchCV
- **AI Race Engineer** — Chat interface to query race winners, fastest laps, and standings from historical data

## Project structure

```
f1/
├── app.py                          # Flask backend (API routes + ML logic)
├── config.py                       # Shared configuration
├── requirements.txt
├── templates/
│   └── index.html                  # Single-page frontend
├── static/
│   ├── css/style.css
│   └── js/app.js
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
└── output/                         # Generated plots from standalone scripts
```

## Getting started

### Prerequisites

- Python 3.9 or higher
- pip

### Installation

```bash
git clone https://github.com/your-username/f1-data-lab.git
cd f1-data-lab

python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Running the web app

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

> **Note:** The first load takes a minute or two while FastF1 downloads and caches session data. Subsequent loads are much faster.

### Running the standalone scripts

Each `part_*` folder contains a self-contained script you can run independently:

```bash
python part_1_pandas/01_f1_data_basics.py
python part_2_fastf1/02_telemetry.py
python part_3_ml_baseline/03_ml_model.py
python part_4_ml_advanced/04_ml_advanced.py
python part_5_ai_engineer/05_ai_race_engineer.py
```

Output plots are saved to `output/`.

## Tech stack

| Layer     | Tools                                        |
|-----------|----------------------------------------------|
| Data      | [FastF1](https://github.com/theOehrly/Fast-F1), pandas, numpy |
| ML        | scikit-learn (RandomForestClassifier, GridSearchCV) |
| Backend   | Flask                                        |
| Frontend  | Vanilla JS, Chart.js, CSS (dark theme)       |
| Plots     | matplotlib, seaborn (standalone scripts)     |

## API endpoints

| Method | Route                       | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | `/api/part1/team-points`    | Constructor + driver points        |
| GET    | `/api/part2/telemetry`      | Speed/throttle/brake telemetry     |
| GET    | `/api/part3/predict`        | Baseline ML predictions            |
| GET    | `/api/part4/predict-advanced` | Advanced ML predictions          |
| POST   | `/api/part5/chat`           | AI Race Engineer chat              |

## Screenshots

The web app lands on the Race Data tab and loads charts automatically. Switch tabs to explore telemetry overlays, run ML models, or chat with the AI engineer.

## License

MIT — see [LICENSE](LICENSE) for details.
