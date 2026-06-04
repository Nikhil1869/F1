import warnings

import numpy as np
import pandas as pd
import xgboost as xgb
from flask import Blueprint, jsonify, request
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

from config import BASELINE_RACE_LIMIT, ADVANCED_RACE_LIMIT, TEST_SIZE, RANDOM_STATE
from services.fastf1_service import get_session, load_sessions_concurrent, get_event_schedule
from services.cache_service import get_cached_result, save_cached_result

warnings.filterwarnings("ignore")

ml_bp = Blueprint("ml", __name__, url_prefix="/api/ml")

_data_cache = {}


def prepare_ml_data(year, limit):
    cache_key = f"ml_{year}_{limit}"
    if cache_key in _data_cache:
        return _data_cache[cache_key]

    disk = get_cached_result(cache_key)
    if disk is not None:
        disk_df = pd.DataFrame(disk)
        _data_cache[cache_key] = disk_df
        return disk_df

    schedule = get_event_schedule(year)
    completed_events = []

    for _, event in schedule.iterrows():
        if event["EventFormat"] == "testing":
            continue
        if event["EventDate"] > pd.Timestamp.now():
            continue
        completed_events.append(event)
        if len(completed_events) >= limit:
            break

    if not completed_events:
        return pd.DataFrame()

    round_nums = [int(e["RoundNumber"]) for e in completed_events]
    sessions = load_sessions_concurrent(year, round_nums, max_workers=4)

    frames = []
    for event in completed_events:
        rnd = int(event["RoundNumber"])
        session = sessions.get(rnd)
        if session is None:
            continue
        try:
            results = session.results.copy()
            results["RoundNumber"] = rnd
            results["EventName"] = event["EventName"]
            cols = [
                "RoundNumber", "EventName", "Abbreviation",
                "TeamName", "GridPosition", "Position", "Points",
            ]
            frames.append(results[cols])
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    for col in ("Position", "Points", "GridPosition"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(20 if col != "Points" else 0)
    df["Podium"] = (df["Position"] <= 3).astype(int)

    _data_cache[cache_key] = df
    save_cached_result(cache_key, df.to_dict(orient="records"))
    return df


def prepare_track_specific_data(event_name):
    cache_key = f"ml_track_specific_{event_name.replace(' ', '_')}"
    if cache_key in _data_cache:
        return _data_cache[cache_key]

    disk = get_cached_result(cache_key)
    if disk is not None:
        disk_df = pd.DataFrame(disk)
        _data_cache[cache_key] = disk_df
        return disk_df

    frames = []

    current_year = 2026

    try:
        schedule_current = get_event_schedule(current_year)
        completed_current = []
        for _, event in schedule_current.iterrows():
            if event["EventFormat"] == "testing":
                continue
            if event["EventDate"] > pd.Timestamp.now():
                continue
            completed_current.append(event)
        
        if completed_current:
            round_nums = [int(e["RoundNumber"]) for e in completed_current]
            sessions = load_sessions_concurrent(current_year, round_nums, max_workers=4)
            for event in completed_current:
                session = sessions.get(int(event["RoundNumber"]))
                if session:
                    try:
                        res = session.results.copy()
                        res["EventName"] = event["EventName"]
                        res["Year"] = current_year
                        frames.append(res[["Year", "EventName", "Abbreviation", "TeamName", "GridPosition", "Position"]])
                    except Exception:
                        pass
    except Exception:
        pass

    historical_years = list(range(2018, current_year))
    for year in historical_years:
        try:
            schedule = get_event_schedule(year)
            target_lower = event_name.lower()
            matching_events = []
            for _, event in schedule.iterrows():
                if event["EventFormat"] == "testing":
                    continue
                if target_lower in event["EventName"].lower() or event["EventName"].lower() in target_lower:
                    matching_events.append(event)
                    
            if matching_events:
                round_nums = [int(e["RoundNumber"]) for e in matching_events]
                sessions = load_sessions_concurrent(year, round_nums, max_workers=4)
                for event in matching_events:
                    session = sessions.get(int(event["RoundNumber"]))
                    if session:
                        try:
                            res = session.results.copy()
                            res["EventName"] = event["EventName"]
                            res["Year"] = year
                            frames.append(res[["Year", "EventName", "Abbreviation", "TeamName", "GridPosition", "Position"]])
                        except Exception:
                            pass
        except Exception:
            continue

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    for col in ("Position", "GridPosition"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(20)
    df["Podium"] = (df["Position"] <= 3).astype(int)

    _data_cache[cache_key] = df
    save_cached_result(cache_key, df.to_dict(orient="records"))
    return df


def _predict_all_drivers_dynamic(df, model, le_team, le_driver, le_event, event_name):
    try:
        event_enc = le_event.transform([event_name])[0]
    except ValueError:
        known_events = list(le_event.classes_)
        matching = [e for e in known_events if event_name.lower() in e.lower() or e.lower() in event_name.lower()]
        if matching:
            event_enc = le_event.transform([matching[0]])[0]
        else:
            event_enc = 0

    current_year = 2026
    drivers_current = df[df["Year"] == current_year]["Abbreviation"].unique()
    if len(drivers_current) == 0:
        drivers_current = df["Abbreviation"].unique()

    avg_grid = df[df["Year"] == current_year].groupby("Abbreviation")["GridPosition"].mean().to_dict()

    predictions = []
    for drv in drivers_current:
        try:
            drv_enc = le_driver.transform([drv])[0]
            team_rows = df[(df["Abbreviation"] == drv) & (df["Year"] == current_year)]
            if len(team_rows) > 0:
                team = team_rows["TeamName"].iloc[-1]
            else:
                team_rows_all = df[df["Abbreviation"] == drv]
                if len(team_rows_all) > 0:
                    team = team_rows_all["TeamName"].iloc[-1]
                else:
                    continue
            team_enc = le_team.transform([team])[0]

            grid_pos = avg_grid.get(drv, 10.0)
            row = [grid_pos, team_enc, drv_enc, event_enc]
            entry = {"driver": drv, "team": team, "simulatedGrid": round(grid_pos, 1)}

            proba = model.predict_proba([row])[0]
            entry["podiumProb"] = float(round(proba[1] if len(proba) > 1 else 0, 3))
            predictions.append(entry)
        except (ValueError, IndexError):
            continue

    predictions.sort(key=lambda p: p["podiumProb"], reverse=True)
    return predictions


def _predict_all_drivers(df, model, le_team, le_driver, le_event, include_form=False):
    last_event = df["EventName"].iloc[-1]
    event_enc = le_event.transform([last_event])[0]

    predictions = []
    for drv in df["Abbreviation"].unique():
        try:
            drv_enc = le_driver.transform([drv])[0]
            team = df[df["Abbreviation"] == drv]["TeamName"].iloc[-1]
            team_enc = le_team.transform([team])[0]
            grid_pos = df[df["Abbreviation"] == drv]["GridPosition"].mean()

            row = [grid_pos, team_enc, drv_enc, event_enc]
            entry = {"driver": drv, "team": team, "simulatedGrid": round(grid_pos, 1)}

            if include_form:
                form = df[df["Abbreviation"] == drv]["DriverForm"].iloc[-1]
                row.append(form)
                entry["form"] = round(float(form), 1)

            proba = model.predict_proba([row])[0]
            entry["podiumProb"] = float(round(proba[1] if len(proba) > 1 else 0, 3))
            predictions.append(entry)
        except (ValueError, IndexError):
            continue

    predictions.sort(key=lambda p: p["podiumProb"], reverse=True)
    return predictions


@ml_bp.route("/upcoming_races")
def upcoming_races():
    try:
        # Try OpenF1 first (instant)
        from services.data_provider import provider
        events = provider.get_session_list(2026, completed_only=False)
        if events:
            return jsonify({"races": [e["name"] for e in events]})

        # Fallback: FastF1
        schedule = get_event_schedule(2026)
        upcoming = []
        for _, event in schedule.iterrows():
            if event["EventFormat"] == "testing":
                continue
            upcoming.append(event["EventName"])
        return jsonify({"races": upcoming})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ml_bp.route("/predict")
def predict():
    event_name = request.args.get("event_name", "Bahrain Grand Prix")
    
    # Check cache first for the full API response
    cache_key = f"ml_predict_resp_{event_name.replace(' ', '_')}"
    if cache_key in _data_cache:
        return jsonify(_data_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _data_cache[cache_key] = disk
        return jsonify(disk)
        
    try:
        df = prepare_track_specific_data(event_name)
        if df.empty:
            return jsonify({"error": f"No historical data available for {event_name}"}), 500

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
            eval_metric='logloss'
        )
        clf.fit(X_train, y_train)

        acc = accuracy_score(y_test, clf.predict(X_test))
        importances = dict(zip(feature_cols, [float(v) for v in clf.feature_importances_]))
        predictions = _predict_all_drivers_dynamic(df, clf, le_team, le_driver, le_event, event_name)

        result = {
            "accuracy": round(acc, 4),
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": f"XGBoost (Track-specific: {event_name})",
            "dataPoints": len(df),
        }
        
        _data_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ml_bp.route("/predict-advanced")
def predict_advanced():
    cache_key = "ml_predict_adv_resp"
    if cache_key in _data_cache:
        return jsonify(_data_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _data_cache[cache_key] = disk
        return jsonify(disk)
        
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
            xgb.XGBClassifier(random_state=RANDOM_STATE, eval_metric='logloss'),
            param_grid, cv=3, n_jobs=-1, scoring="accuracy",
        )
        grid.fit(X_train, y_train)

        best = grid.best_estimator_
        acc = accuracy_score(y_test, best.predict(X_test))
        importances = dict(zip(feature_cols, [float(v) for v in best.feature_importances_]))

        predictions = _predict_all_drivers(
            df, best, le_team, le_driver, le_event, include_form=True
        )

        result = {
            "accuracy": round(acc, 4),
            "bestParams": grid.best_params_,
            "featureImportances": importances,
            "predictions": predictions[:10],
            "model": "XGBoost (tuned + DriverForm)",
            "dataPoints": len(df),
        }
        _data_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ml_bp.route("/simulate-season")
def simulate_season():
    target_year = 2026
    
    cache_key = f"ml_simulate_season_{target_year}"
    if cache_key in _data_cache:
        return jsonify(_data_cache[cache_key])
    disk = get_cached_result(cache_key)
    if disk:
        _data_cache[cache_key] = disk
        return jsonify(disk)
        
    try:
        df_train = prepare_ml_data(2025, ADVANCED_RACE_LIMIT)
        if df_train.empty:
            df_train = prepare_ml_data(2024, ADVANCED_RACE_LIMIT)
            
        if df_train.empty:
             return jsonify({"error": "No training data available"}), 500
             
        df_train["DriverForm"] = df_train.groupby("Abbreviation")["Points"].transform(lambda s: s.cumsum() - s)
        
        le_team = LabelEncoder()
        le_driver = LabelEncoder()
        le_event = LabelEncoder()
        
        df_train["TeamEnc"] = le_team.fit_transform(df_train["TeamName"])
        df_train["DriverEnc"] = le_driver.fit_transform(df_train["Abbreviation"])
        df_train["EventEnc"] = le_event.fit_transform(df_train["EventName"])
        
        feature_cols = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc", "DriverForm"]
        X_train = df_train[feature_cols]
        y_train = df_train["Podium"]
        
        clf = xgb.XGBClassifier(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=RANDOM_STATE, eval_metric='logloss')
        clf.fit(X_train, y_train)

        schedule = get_event_schedule(target_year)
        
        current_points = {}
        driver_teams = {}
        avg_grid = {}
        completed_races = 0
        
        completed_events = []
        for _, event in schedule.iterrows():
            if event["EventFormat"] == "testing":
                continue
            if event["EventDate"] < pd.Timestamp.now():
                completed_events.append(event)
                
        if completed_events:
            round_nums = [int(e["RoundNumber"]) for e in completed_events]
            sessions = load_sessions_concurrent(target_year, round_nums, max_workers=4)
            for event in completed_events:
                try:
                    session = sessions.get(int(event["RoundNumber"]))
                    if not session: continue
                    res = session.results
                    for _, row in res.iterrows():
                        drv = row["Abbreviation"]
                        pts = pd.to_numeric(row["Points"], errors="coerce")
                        if pd.isna(pts): pts = 0
                        grid = pd.to_numeric(row["GridPosition"], errors="coerce")
                        if pd.isna(grid): grid = 20
                        
                        current_points[drv] = current_points.get(drv, 0) + pts
                        driver_teams[drv] = row["TeamName"]
                        if drv not in avg_grid:
                            avg_grid[drv] = []
                        avg_grid[drv].append(grid)
                    completed_races += 1
                except Exception:
                    continue
                    
        for drv in avg_grid:
            avg_grid[drv] = sum(avg_grid[drv]) / len(avg_grid[drv])
            
        remaining_races = []
        simulated_points = current_points.copy()
        
        if not driver_teams:
            for drv in df_train["Abbreviation"].unique():
                team_rows = df_train[df_train["Abbreviation"] == drv]
                if not team_rows.empty:
                    driver_teams[drv] = team_rows["TeamName"].iloc[-1]
                    avg_grid[drv] = team_rows["GridPosition"].mean()
                    simulated_points[drv] = 0
             
        for _, event in schedule.iterrows():
            if event["EventFormat"] == "testing":
                continue
            if event["EventDate"] >= pd.Timestamp.now():
                event_name = event["EventName"]
                try:
                    event_enc = le_event.transform([event_name])[0]
                except ValueError:
                    known_events = list(le_event.classes_)
                    matching = [e for e in known_events if event_name.lower() in e.lower() or e.lower() in event_name.lower()]
                    event_enc = le_event.transform([matching[0]])[0] if matching else 0
                    
                race_preds = []
                for drv, team in driver_teams.items():
                    try:
                        drv_enc = le_driver.transform([drv])[0]
                        team_enc = le_team.transform([team])[0]
                        grid = avg_grid.get(drv, 10.0)
                        form = simulated_points.get(drv, 0)
                        
                        proba = clf.predict_proba([[grid, team_enc, drv_enc, event_enc, form]])[0]
                        podium_prob = proba[1] if len(proba) > 1 else 0
                        race_preds.append({"driver": drv, "prob": podium_prob})
                    except (ValueError, IndexError):
                        continue
                        
                race_preds.sort(key=lambda x: x["prob"], reverse=True)
                
                pts_system = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
                top_3 = []
                for i, rp in enumerate(race_preds):
                    if i < len(pts_system):
                        simulated_points[rp["driver"]] += pts_system[i]
                    if i < 3:
                        top_3.append(rp["driver"])
                        
                remaining_races.append({
                    "eventName": event_name,
                    "podium": top_3
                })
                
        final_standings = [{"driver": k, "team": driver_teams.get(k, "Unknown"), "points": v} for k, v in simulated_points.items()]
        final_standings.sort(key=lambda x: x["points"], reverse=True)
        
        for idx, item in enumerate(final_standings):
             item["rank"] = idx + 1
        
        result = {
            "completedRaces": completed_races,
            "remainingRacesCount": len(remaining_races),
            "finalStandings": final_standings,
            "racePredictions": remaining_races
        }
        
        _data_cache[cache_key] = result
        save_cached_result(cache_key, result)
        
        return jsonify(result)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
