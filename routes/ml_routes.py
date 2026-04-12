import warnings

import fastf1
import numpy as np
import pandas as pd
import xgboost as xgb
from flask import Blueprint, jsonify
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

from config import BASELINE_RACE_LIMIT, ADVANCED_RACE_LIMIT, TEST_SIZE, RANDOM_STATE
from routes.data_routes import get_session

warnings.filterwarnings("ignore")

ml_bp = Blueprint("ml", __name__, url_prefix="/api/ml")

_data_cache = {}


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
            entry["podiumProb"] = float(round(proba[1] if len(proba) > 1 else 0, 3))
            predictions.append(entry)
        except (ValueError, IndexError):
            continue

    predictions.sort(key=lambda p: p["podiumProb"], reverse=True)
    return predictions


@ml_bp.route("/predict")
def predict():
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

        clf = xgb.XGBClassifier(
            n_estimators=100, 
            max_depth=5, 
            learning_rate=0.1, 
            random_state=RANDOM_STATE, 
            use_label_encoder=False, 
            eval_metric='logloss'
        )
        clf.fit(X_train, y_train)

        acc = accuracy_score(y_test, clf.predict(X_test))
        importances = dict(zip(feature_cols, [float(v) for v in clf.feature_importances_]))
        predictions = _predict_all_drivers(df, clf, le_team, le_driver, le_event)

        return jsonify({
            "accuracy": round(acc, 4),
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": "XGBoost (baseline)",
            "dataPoints": len(df),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ml_bp.route("/predict-advanced")
def predict_advanced():
    try:
        df = prepare_ml_data(2023, ADVANCED_RACE_LIMIT)
        if df.empty:
            return jsonify({"error": "No race data available"}), 500

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
            "n_estimators": [50, 100],
            "max_depth": [3, 5],
            "learning_rate": [0.05, 0.1]
        }
        grid = GridSearchCV(
            xgb.XGBClassifier(random_state=RANDOM_STATE, use_label_encoder=False, eval_metric='logloss'),
            param_grid, cv=3, n_jobs=-1, scoring="accuracy",
        )
        grid.fit(X_train, y_train)

        best = grid.best_estimator_
        acc = accuracy_score(y_test, best.predict(X_test))
        importances = dict(zip(feature_cols, [float(v) for v in best.feature_importances_]))

        predictions = _predict_all_drivers(
            df, best, le_team, le_driver, le_event, include_form=True
        )

        return jsonify({
            "accuracy": round(acc, 4),
            "bestParams": grid.best_params_,
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": "XGBoost (tuned + DriverForm)",
            "dataPoints": len(df),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
