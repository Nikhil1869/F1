import os
import fastf1


def get_race_winner(year, round_number):
    try:
        session = fastf1.get_session(year, round_number, "R")
        session.load(telemetry=False, weather=False)
        winner = session.results.iloc[0]
        return (
            f"The winner was {winner['FullName']} ({winner['Abbreviation']}) "
            f"for {winner['TeamName']}."
        )
    except Exception as e:
        return f"Could not retrieve race winner: {e}"


def get_fastest_lap(year, round_number):
    try:
        session = fastf1.get_session(year, round_number, "R")
        session.load(telemetry=False, weather=False)
        fastest = session.laps.pick_fastest()
        return f"The fastest lap was {fastest['LapTime']} by {fastest['Driver']}."
    except Exception as e:
        return f"Could not retrieve fastest lap: {e}"


class AIRaceEngineer:
    """
    In a real setup these tool functions would be passed to an LLM agent
    (e.g. LangChain or Google GenAI SDK). This is a mock version that
    pattern-matches keywords instead.
    """

    def __init__(self, api_key=None):
        self.api_key = api_key
        print("AI Race Engineer initialised (mock mode).")

    def chat(self, query):
        print(f"\nUser: {query}")
        lower = query.lower()

        if "winner" in lower and "2023" in query:
            print("Engineer: Checking the database...")
            print("Engineer:", get_race_winner(2023, 1))
        elif "fastest lap" in lower and "2023" in query:
            print("Engineer: Looking up fastest lap...")
            print("Engineer:", get_fastest_lap(2023, 1))
        else:
            print(
                "Engineer: I don't have the tools to answer that yet. "
                "Hook up an LLM API key to enable free-form queries."
            )


def main():
    print("F1 AI Race Engineer — Test Console")
    print("-----------------------------------")

    os.makedirs("fastf1_cache", exist_ok=True)
    fastf1.Cache.enable_cache("fastf1_cache")

    engineer = AIRaceEngineer()

    test_queries = [
        "Who was the winner of the first race in 2023?",
        "What was the fastest lap in the 2023 Bahrain GP?",
        "Who will win the next race?",
    ]
    for q in test_queries:
        engineer.chat(q)


if __name__ == "__main__":
    main()
