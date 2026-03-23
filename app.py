import re
import os
import warnings

import fastf1
import numpy as np
import pandas as pd
from flask import Flask, render_template, jsonify, request
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

from config import (
    CACHE_DIR, DEFAULT_YEAR, DEFAULT_ROUND,
    BASELINE_RACE_LIMIT, ADVANCED_RACE_LIMIT,
    TEST_SIZE, RANDOM_STATE, TELEMETRY_STEP,
)

warnings.filterwarnings("ignore")

app = Flask(__name__)

os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

_session_cache = {}
_data_cache = {}


def get_session(year, round_num, session_type="R"):
    key = (year, round_num, session_type)
    if key not in _session_cache:
        session = fastf1.get_session(year, round_num, session_type)
        # only load telemetry for qualifying — race telemetry is too large
        session.load(
            telemetry=(session_type == "Q"),
            weather=False,
            messages=False,
        )
        _session_cache[key] = session
    return _session_cache[key]


def prepare_ml_data(year, limit):
    cache_key = f"ml_{year}_{limit}"
    if cache_key in _data_cache:
        return _data_cache[cache_key]

    schedule = fastf1.get_event_schedule(year)
    frames = []
    loaded = 0

    for _, event in schedule.iterrows():
        if event["EventFormat"] == "testing":
            continue
        if event["EventDate"] > pd.Timestamp.now():
            continue
        try:
            session = get_session(year, event["RoundNumber"])
            results = session.results.copy()
            results["RoundNumber"] = event["RoundNumber"]
            results["EventName"] = event["EventName"]
            cols = [
                "RoundNumber", "EventName", "Abbreviation",
                "TeamName", "GridPosition", "Position", "Points",
            ]
            frames.append(results[cols])
            loaded += 1
            if loaded >= limit:
                break
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    for col in ("Position", "Points", "GridPosition"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(20 if col != "Points" else 0)
    df["Podium"] = (df["Position"] <= 3).astype(int)

    _data_cache[cache_key] = df
    return df


def _parse_year(text):
    match = re.search(r"20[12]\d", text)
    return int(match.group()) if match else None


def _parse_round(text):
    for pattern in (r"round\s*(\d+)", r"race\s*(\d+)"):
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/part1/team-points")
def part1_team_points():
    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND)
        results = session.results

        df = results[["Position", "Abbreviation", "TeamName", "Points"]].copy()
        df["Position"] = pd.to_numeric(df["Position"], errors="coerce")
        df["Points"] = pd.to_numeric(df["Points"], errors="coerce")

        teams = (
            df.groupby("TeamName")["Points"]
            .sum()
            .reset_index()
            .sort_values("Points", ascending=False)
        )
        drivers = (
            df.sort_values("Position")[["Abbreviation", "TeamName", "Points", "Position"]]
            .head(10)
        )

        return jsonify({
            "teams": teams.to_dict(orient="records"),
            "drivers": drivers.to_dict(orient="records"),
            "race": "2024 Bahrain Grand Prix",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/part2/telemetry")
def part2_telemetry():
    d1 = request.args.get("d1", "VER")
    d2 = request.args.get("d2", "LEC")
    try:
        session = get_session(DEFAULT_YEAR, DEFAULT_ROUND, "Q")

        fastest_1 = session.laps.pick_driver(d1).pick_fastest()
        fastest_2 = session.laps.pick_driver(d2).pick_fastest()

        tel1 = fastest_1.get_telemetry().add_distance()
        tel2 = fastest_2.get_telemetry().add_distance()

        step = TELEMETRY_STEP

        def _slice(series):
            return series.iloc[::step].tolist()

        return jsonify({
            "d1": d1,
            "d2": d2,
            "tel1": {
                "distance": _slice(tel1["Distance"]),
                "speed":    _slice(tel1["Speed"]),
                "throttle": _slice(tel1["Throttle"]),
                "brake":    _slice(tel1["Brake"].astype(int)),
            },
            "tel2": {
                "distance": _slice(tel2["Distance"]),
                "speed":    _slice(tel2["Speed"]),
                "throttle": _slice(tel2["Throttle"]),
                "brake":    _slice(tel2["Brake"].astype(int)),
            },
            "session": "2024 Bahrain Qualifying",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/part3/predict")
def part3_predict():
    try:
        df = prepare_ml_data(2023, BASELINE_RACE_LIMIT)
        if df.empty:
            return jsonify({"error": "No race data available"}), 500

        le_team = LabelEncoder()
        le_driver = LabelEncoder()
        le_event = LabelEncoder()

        df["TeamEnc"]   = le_team.fit_transform(df["TeamName"])
        df["DriverEnc"] = le_driver.fit_transform(df["Abbreviation"])
        df["EventEnc"]  = le_event.fit_transform(df["EventName"])

        feature_cols = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc"]
        X = df[feature_cols]
        y = df["Podium"]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )

        clf = RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE)
        clf.fit(X_train, y_train)

        acc = accuracy_score(y_test, clf.predict(X_test))
        importances = dict(zip(feature_cols, clf.feature_importances_.tolist()))
        predictions = _predict_all_drivers(df, clf, le_team, le_driver, le_event)

        return jsonify({
            "accuracy": round(acc, 4),
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": "RandomForest (baseline)",
            "dataPoints": len(df),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/part4/predict-advanced")
def part4_predict_advanced():
    try:
        df = prepare_ml_data(2023, ADVANCED_RACE_LIMIT)
        if df.empty:
            return jsonify({"error": "No race data available"}), 500

        # cumulative points before current race — a proxy for recent form
        df["DriverForm"] = df.groupby("Abbreviation")["Points"].transform(
            lambda s: s.cumsum() - s
        )

        le_team = LabelEncoder()
        le_driver = LabelEncoder()
        le_event = LabelEncoder()

        df["TeamEnc"]   = le_team.fit_transform(df["TeamName"])
        df["DriverEnc"] = le_driver.fit_transform(df["Abbreviation"])
        df["EventEnc"]  = le_event.fit_transform(df["EventName"])

        feature_cols = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc", "DriverForm"]
        X = df[feature_cols]
        y = df["Podium"]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE
        )

        param_grid = {
            "n_estimators": [50, 100, 200],
            "max_depth": [None, 5, 10],
            "min_samples_split": [2, 5],
        }
        grid = GridSearchCV(
            RandomForestClassifier(random_state=RANDOM_STATE),
            param_grid, cv=3, n_jobs=-1, scoring="accuracy",
        )
        grid.fit(X_train, y_train)

        best = grid.best_estimator_
        acc = accuracy_score(y_test, best.predict(X_test))
        importances = dict(zip(feature_cols, best.feature_importances_.tolist()))

        predictions = _predict_all_drivers(
            df, best, le_team, le_driver, le_event, include_form=True
        )

        return jsonify({
            "accuracy": round(acc, 4),
            "bestParams": grid.best_params_,
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": "RandomForest (tuned + DriverForm)",
            "dataPoints": len(df),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


def _predict_all_drivers(df, model, le_team, le_driver, le_event, include_form=False):
    last_event = df["EventName"].iloc[-1]
    event_enc = le_event.transform([last_event])[0]

    predictions = []
    for drv in df["Abbreviation"].unique():
        try:
            drv_enc = le_driver.transform([drv])[0]
            team = df.loc[df["Abbreviation"] == drv, "TeamName"].iloc[0]
            team_enc = le_team.transform([team])[0]

            row = [1.0, team_enc, drv_enc, event_enc]
            entry = {"driver": drv, "team": team}

            if include_form:
                form = df.loc[df["Abbreviation"] == drv, "DriverForm"].iloc[-1]
                row.append(form)
                entry["form"] = round(float(form), 1)

            proba = model.predict_proba([row])[0]
            entry["podiumProb"] = round(proba[1] if len(proba) > 1 else 0, 3)
            predictions.append(entry)
        except (ValueError, IndexError):
            continue

    predictions.sort(key=lambda p: p["podiumProb"], reverse=True)
    return predictions


@app.route("/api/part5/chat", methods=["POST"])
def part5_chat():
    data = request.json or {}
    msg = data.get("message", "").lower()

    if "winner" in msg:
        reply = _chat_winner(msg)
    elif "fastest" in msg:
        reply = _chat_fastest(msg)
    elif "standings" in msg or "championship" in msg:
        reply = _chat_standings(msg)
    elif "help" in msg:
        reply = (
            "🤖 I can answer:\n"
            '• "Who won round X in YYYY?"\n'
            '• "Fastest lap round X in YYYY"\n'
            '• "Championship standings YYYY"\n'
            "Just ask!"
        )
    else:
        reply = (
            "🤖 I'm the AI Race Engineer! Try asking about "
            "**race winners**, **fastest laps**, or **championship standings**. "
            "Type **help** for examples."
        )

    return jsonify({"reply": reply})


def _chat_winner(msg):
    year = _parse_year(msg) or 2023
    rd = _parse_round(msg) or 1
    try:
        session = get_session(year, rd)
        winner = session.results.iloc[0]
        return (
            f"🏆 The winner of Round {rd} in {year} was "
            f"**{winner['FullName']}** ({winner['Abbreviation']}) "
            f"driving for **{winner['TeamName']}**."
        )
    except Exception as exc:
        return f"Sorry, I couldn't find that race data: {exc}"


def _chat_fastest(msg):
    year = _parse_year(msg) or 2023
    rd = _parse_round(msg) or 1
    try:
        session = get_session(year, rd)
        fl = session.laps.pick_fastest()
        return f"⚡ The fastest lap was **{fl['LapTime']}** set by **{fl['Driver']}**."
    except Exception as exc:
        return f"Sorry, I couldn't find that data: {exc}"


def _chat_standings(msg):
    year = _parse_year(msg) or 2023
    try:
        schedule = fastf1.get_event_schedule(year)
        completed = [
            e for _, e in schedule.iterrows()
            if e["EventFormat"] != "testing" and e["EventDate"] < pd.Timestamp.now()
        ]
        if not completed:
            return "No completed races found for that year."

        last = completed[-1]["RoundNumber"]
        session = get_session(year, last)
        top5 = session.results[["Abbreviation", "TeamName", "Points"]].head(5)
        rows = top5.to_dict(orient="records")

        lines = [f"📊 Top 5 from Round {last} of {year}:"]
        for r in rows:
            lines.append(f"  {r['Abbreviation']} ({r['TeamName']}) — {r['Points']} pts")
        return "\n".join(lines)
    except Exception as exc:
        return f"Sorry, error: {exc}"


if __name__ == "__main__":
    app.run(debug=True, port=5000)
