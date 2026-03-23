import os
import pandas as pd
import fastf1
import matplotlib.pyplot as plt
import seaborn as sns

os.makedirs("output", exist_ok=True)
os.makedirs("fastf1_cache", exist_ok=True)
fastf1.Cache.enable_cache("fastf1_cache")


def main():
    print("Loading 2025 F1 Season Schedule...")
    schedule = fastf1.get_event_schedule(2025)
    print(schedule[["RoundNumber", "EventName", "Country"]].head())

    print("\nLoading race results for 2024 Bahrain Grand Prix...")
    try:
        session = fastf1.get_session(2024, 1, "R")
        session.load()
        results = session.results

        df = results[["Position", "DriverNumber", "Abbreviation", "TeamName", "Time", "Points"]]
        print("\nTop 5 Results:")
        print(df.head())

        team_points = (
            df.groupby("TeamName")["Points"]
            .sum()
            .reset_index()
            .sort_values("Points", ascending=False)
        )

        plt.figure(figsize=(10, 6))
        sns.barplot(x="Points", y="TeamName", data=team_points, palette="viridis")
        plt.title("Constructor Points - 2024 Bahrain Grand Prix")
        plt.xlabel("Points")
        plt.ylabel("Team")
        plt.tight_layout()
        plt.savefig("output/01_team_points.png")
        print("\nSaved plot to output/01_team_points.png")
    except Exception as e:
        print(f"Error loading session data: {e}")


if __name__ == "__main__":
    main()
