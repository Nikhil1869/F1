import re

import fastf1
import pandas as pd
from flask import Blueprint, jsonify, request

from routes.data_routes import get_session

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")


def _parse_year(text):
    match = re.search(r"20[12]\d", text)
    return int(match.group()) if match else None


def _parse_round(text):
    for pattern in (r"round\s*(\d+)", r"race\s*(\d+)"):
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    return None


def _chat_winner(msg):
    year = _parse_year(msg) or 2023
    rd = _parse_round(msg) or 1
    try:
        session = get_session(year, rd)
        winner = session.results.iloc[0]
        return (
            f"\U0001f3c6 The winner of Round {rd} in {year} was "
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
        return f"\u26a1 The fastest lap was **{fl['LapTime']}** set by **{fl['Driver']}**."
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

        lines = [f"\U0001f4ca Top 5 from Round {last} of {year}:"]
        for r in rows:
            lines.append(f"  {r['Abbreviation']} ({r['TeamName']}) \u2014 {r['Points']} pts")
        return "\n".join(lines)
    except Exception as exc:
        return f"Sorry, error: {exc}"


@chat_bp.route("/", methods=["POST"])
def chat():
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
            "\U0001f916 I can answer:\n"
            '\u2022 "Who won round X in YYYY?"\n'
            '\u2022 "Fastest lap round X in YYYY"\n'
            '\u2022 "Championship standings YYYY"\n'
            "Just ask!"
        )
    else:
        reply = (
            "\U0001f916 I'm the AI Race Engineer! Try asking about "
            "**race winners**, **fastest laps**, or **championship standings**. "
            "Type **help** for examples."
        )

    return jsonify({"reply": reply})
