import os
import requests
from flask import Blueprint, jsonify, request

chat_bp = Blueprint("chat", __name__, url_prefix="/api/chat")
LLM_API_KEY = os.getenv("LLM_API_KEY") 

RACE_ENGINEER_PROMPT = """
You are a highly experienced, concise F1 Race Engineer talking directly to your driver over the team radio.
Your responses must be short, punchy, and highly analytical (under 40 words).
Use strict F1 terminology (e.g., 'Copy that', 'Box box', 'Push now', 'Deploy').
If the provided telemetry data is 'Unknown' or speed is 0, assume the driver is currently in the garage pitlane 
looking at the F1 Data Analytics Platform screen with you. You can answer general F1 questions or explain the web app.
Never break your Race Engineer character.
"""

@chat_bp.route("/", methods=["POST"])
def chat():
    data = request.json or {}
    msg = data.get("message", "")
    context = data.get("context", {})

    telemetry_str = f"[TELEMETRY] Lap: {context.get('lap', 'Unknown')} | Pos: P{context.get('position', 'Unknown')} | Speed: {context.get('speed', 0)} km/h | Target Driver: {context.get('driver', 'None')}."

    if not LLM_API_KEY:
        # Fallback if no API key is provided
        return jsonify({"reply": "Radio check. (LLM_API_KEY not configured). " + telemetry_str})

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": RACE_ENGINEER_PROMPT},
                    {"role": "system", "content": telemetry_str},
                    {"role": "user", "content": msg}
                ]
            }
        )
        reply = response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        reply = f"Radio check, we missed that. Try again. (Error: {str(e)})"

    return jsonify({"reply": reply})
