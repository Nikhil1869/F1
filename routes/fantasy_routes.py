from flask import Blueprint, jsonify, request

fantasy_bp = Blueprint("fantasy", __name__, url_prefix="/api/fantasy")

POINTS_SYSTEM = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1}


@fantasy_bp.route("/simulate", methods=["POST"])
def simulate():
    data = request.json or {}
    selected_drivers = data.get("drivers", [])

    if len(selected_drivers) != 5:
        return jsonify({"error": "You must select exactly 5 drivers."}), 400

    try:
        from routes.ml_routes import prepare_ml_data
        from sklearn.preprocessing import LabelEncoder
        import xgboost as xgb
        from config import BASELINE_RACE_LIMIT, TEST_SIZE, RANDOM_STATE

        df = prepare_ml_data(2023, BASELINE_RACE_LIMIT)
        if df.empty:
            return jsonify({"error": "No race data available"}), 500

        le_team = LabelEncoder()
        le_driver = LabelEncoder()
        le_event = LabelEncoder()

        df["TeamEnc"] = le_team.fit_transform(df["TeamName"])
        df["DriverEnc"] = le_driver.fit_transform(df["Abbreviation"])
        df["EventEnc"] = le_event.fit_transform(df["EventName"])

        feature_cols = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc"]
        X = df[feature_cols]
        y = df["Podium"]

        clf = xgb.XGBClassifier(
            n_estimators=100, max_depth=5, learning_rate=0.1,
            random_state=RANDOM_STATE, use_label_encoder=False, eval_metric='logloss'
        )
        clf.fit(X, y)

        last_event = df["EventName"].iloc[-1]
        event_enc = le_event.transform([last_event])[0]

        all_predictions = []
        for drv in df["Abbreviation"].unique():
            try:
                drv_enc = le_driver.transform([drv])[0]
                team = df.loc[df["Abbreviation"] == drv, "TeamName"].iloc[0]
                team_enc = le_team.transform([team])[0]

                row = [1.0, team_enc, drv_enc, event_enc]
                proba = clf.predict_proba([row])[0]
                podium_prob = float(proba[1]) if len(proba) > 1 else 0

                all_predictions.append({
                    "driver": drv,
                    "team": team,
                    "podiumProb": podium_prob
                })
            except (ValueError, IndexError):
                continue

        all_predictions.sort(key=lambda p: p["podiumProb"], reverse=True)

        for i, pred in enumerate(all_predictions):
            pred["predictedPosition"] = i + 1
            pred["points"] = POINTS_SYSTEM.get(i + 1, 0)

        user_team = [p for p in all_predictions if p["driver"] in selected_drivers]
        user_score = sum(p["points"] for p in user_team)

        best_five = sorted(all_predictions, key=lambda p: p["points"], reverse=True)[:5]
        best_score = sum(p["points"] for p in best_five)

        pct = (user_score / best_score * 100) if best_score > 0 else 0
        if pct >= 80:
            rating = "S-Tier \ud83c\udfc6"
        elif pct >= 60:
            rating = "A-Tier \u2b50"
        elif pct >= 40:
            rating = "B-Tier \ud83d\udc4d"
        elif pct >= 20:
            rating = "C-Tier \ud83d\ude10"
        else:
            rating = "D-Tier \ud83d\ude2c"

        return jsonify({
            "userScore": user_score,
            "bestScore": best_score,
            "rating": rating,
            "userTeam": user_team,
            "fullGrid": all_predictions[:10],
        })

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@fantasy_bp.route("/drivers")
def list_drivers():
    try:
        from routes.ml_routes import prepare_ml_data
        from config import BASELINE_RACE_LIMIT

        df = prepare_ml_data(2023, BASELINE_RACE_LIMIT)
        if df.empty:
            return jsonify({"error": "No data"}), 500

        drivers = []
        for drv in df["Abbreviation"].unique():
            team = df.loc[df["Abbreviation"] == drv, "TeamName"].iloc[0]
            drivers.append({"driver": drv, "team": team})

        drivers.sort(key=lambda d: d["driver"])
        return jsonify({"drivers": drivers})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
