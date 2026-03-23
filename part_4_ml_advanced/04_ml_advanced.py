import os
import pandas as pd
import fastf1
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import LabelEncoder

os.makedirs("fastf1_cache", exist_ok=True)
fastf1.Cache.enable_cache("fastf1_cache")

RACE_LIMIT = 15


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
                                   "TeamName", "GridPosition", "Position", "Points"]])
            loaded += 1
            if loaded >= RACE_LIMIT:
                break
        except Exception as e:
            print(f"Skipping {event['EventName']}: {e}")

    if not frames:
        return pd.DataFrame()

    df = pd.concat(frames, ignore_index=True)
    df["Position"] = pd.to_numeric(df["Position"], errors="coerce").fillna(20)
    df["Points"]   = pd.to_numeric(df["Points"], errors="coerce").fillna(0)

    # cumulative points before current race — proxy for recent form
    df["DriverForm"] = df.groupby("Abbreviation")["Points"].transform(
        lambda s: s.cumsum() - s
    )

    df["Podium"] = (df["Position"] <= 3).astype(int)
    return df


def main():
    df = load_season_results(2023)
    if df.empty:
        print("Failed to load any race data.")
        return

    print("Dataset sample with DriverForm:")
    print(df[["Abbreviation", "EventName", "GridPosition", "DriverForm", "Podium"]].head())

    le_team   = LabelEncoder()
    le_driver = LabelEncoder()
    le_event  = LabelEncoder()

    df["TeamEnc"]   = le_team.fit_transform(df["TeamName"])
    df["DriverEnc"] = le_driver.fit_transform(df["Abbreviation"])
    df["EventEnc"]  = le_event.fit_transform(df["EventName"])

    features = ["GridPosition", "TeamEnc", "DriverEnc", "EventEnc", "DriverForm"]
    X = df[features]
    y = df["Podium"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("\nRunning GridSearchCV...")
    param_grid = {
        "n_estimators": [50, 100, 200],
        "max_depth": [None, 5, 10],
        "min_samples_split": [2, 5],
    }
    grid = GridSearchCV(
        RandomForestClassifier(random_state=42),
        param_grid, cv=3, n_jobs=-1, scoring="accuracy",
    )
    grid.fit(X_train, y_train)

    print(f"Best params: {grid.best_params_}")

    best = grid.best_estimator_
    preds = best.predict(X_test)
    print("Accuracy:", accuracy_score(y_test, preds))
    print("\n" + classification_report(y_test, preds))


if __name__ == "__main__":
    main()
