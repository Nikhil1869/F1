from flask import Blueprint, request, jsonify
from services.fastf1_service import load_session_async, get_job_status

async_bp = Blueprint("async", __name__, url_prefix="/api")

@async_bp.route("/session/load", methods=["POST", "GET"])
def session_load():
    """
    Triggers an asynchronous FastF1 load.
    Parameters (query or JSON):
    - year: int
    - round: int
    - session: str (e.g. 'R', 'Q')
    - full: bool (whether to load full telemetry + weather + messages)
    Returns: 202 Accepted with job_id
    """
    if request.method == "POST":
        data = request.get_json() or {}
    else:
        data = request.args

    try:
        year = int(data.get("year"))
        round_num = int(data.get("round"))
    except (TypeError, ValueError):
        return jsonify({"error": "year and round must be integers"}), 400

    session_type = data.get("session", "R")
    
    raw_full = data.get("full", "false")
    if isinstance(raw_full, str):
        full = raw_full.lower() == "true"
    else:
        full = bool(raw_full)

    job_id = load_session_async(year, round_num, session_type, full)
    
    return jsonify({
        "job_id": job_id,
        "status": "pending",
        "message": "Session loading started."
    }), 202


@async_bp.route("/session/status/<job_id>", methods=["GET"])
def session_status(job_id):
    """
    Check the status of an asynchronous load.
    Returns:
    - 200 OK with status='ready', progress=100
    - 200 OK with status='pending', progress=0..100
    - 500 with status='error', error='message'
    - 404 if job_id not found
    """
    status_info = get_job_status(job_id)
    if not status_info:
        return jsonify({"error": "Job not found"}), 404

    if status_info.get("status") == "error":
        return jsonify(status_info), 500

    return jsonify(status_info), 200


@async_bp.route("/health", methods=["GET"])
def health_check():
    """Simple health check endpoint."""
    return jsonify({"status": "ok"}), 200
