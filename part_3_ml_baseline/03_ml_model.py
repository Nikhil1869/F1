import os
import xgboost as xgb
import matplotlib.pyplot as plt
import pandas as pd
import fastf1
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

os.makedirs("fastf1_cache", exist_ok=True)
os.makedirs("output", exist_ok=True)
fastf1.Cache.enable_cache("fastf1_cache")

RACE_LIMIT = 10

def load_season_results(year):
    schedule = fastf1.get_event_schedule(year)
    frames = []
    loaded = 0

    for _, event in schedule.iterrows():
        if event["EventFormat"] == "testing" or event["EventDate"] > pd.Timestamp.now():
            continue
        try:
            session = fastf1.get_session(year, event["EventName"], "R")
            session.load(telemetry=False, weather=False, messages=False)
            results = session.results.copy()
            results["RoundNumber"] = event["RoundNumber"]
            results["EventName"] = event["EventName"]
            frames.append(results[["RoundNumber", "EventName", "Abbreviation",
                                   "TeamName", "GridPosition", "Position"]])
            loaded += 1
            if loaded >= RACE_LIMIT:
                break
        except Exception as e:
            print(f"Skipping {event['EventName']}: {e}")

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df["Position"] = pd.to_numeric(df["Position"], errors="coerce").fillna(20)
    df["Podium"] = (df["Position"] <= 3).astype(int)
    return df

def train_and_evaluate(X, y, feature_names):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("\nTraining XGBoost Model...")
    clf = xgb.XGBClassifier(
        n_estimators=100, 
        max_depth=5, 
        learning_rate=0.1, 
        random_state=42, 
        use_label_encoder=False, 
        eval_metric='logloss'
    )
    clf.fit(X_train, y_train)

    probabilities = clf.predict_proba(X_test)
    preds = clf.predict(X_test)
    print(f"Accuracy: {accuracy_score(y_test, preds):.4f}")
    if len(preds) > 0:
        print(f"Prediction: {preds[0]}, Confidence: {probabilities[0].max() * 100:.2f}%")

    importance_df = pd.DataFrame({
        'Feature': feature_names,
        'Importance': clf.feature_importances_
    }).sort_values(by='Importance', ascending=False)

    plt.figure(figsize=(8, 6))
    plt.barh(importance_df['Feature'], importance_df['Importance'], color='#e10600')
    plt.gca().invert_yaxis()
    plt.title('XGBoost Feature Importance - Podium Predictor')
    plt.xlabel('Gain Score')
    plt.tight_layout()
    plt.savefig('output/feature_importance.png')
    print("Feature importance plot saved to output/feature_importance.png")

    return clf

def main():
    df = load_season_results(2023)
    if df.empty:
        print("Failed to load any race data.")
        return

    le_team   = LabelEncoder()
    le_driver = LabelEncoder()
    le_event  = LabelEncoder()

    df["TeamEnc"]   = le_team.fit_transform(df["TeamName"])
    df["DriverEnc"] = le_driver.fit_transform(df["Abbreviation"])
    df["EventEnc"]  = le_event.fit_transform(df["EventName"])

    features = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc"]
    X = df[features]
    y = df["Podium"]

    clf = train_and_evaluate(X, y, features)
    
    try:
        sample = [[
            1.0,
            le_team.transform(["Red Bull Racing"])[0],
            le_driver.transform(["VER"])[0],
            le_event.transform([df["EventName"].iloc[0]])[0],
        ]]
        prob = clf.predict_proba(sample)[0]
        print(f"\nVER from P1 podium probability: {prob[1]*100:.2f}%")
    except ValueError:
        pass


if __name__ == "__main__":
    main()
