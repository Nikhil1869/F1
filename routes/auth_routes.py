from flask import Blueprint, render_template, redirect, url_for, request, flash, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User, SavedReplay

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            next_page = request.args.get("next")
            return redirect(next_page or url_for("index"))
        flash("Invalid username or password.", "error")

    return render_template("login.html")


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        if len(username) < 3:
            flash("Username must be at least 3 characters.", "error")
        elif len(password) < 4:
            flash("Password must be at least 4 characters.", "error")
        elif User.query.filter_by(username=username).first():
            flash("Username already taken.", "error")
        else:
            user = User(username=username)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
            login_user(user)
            return redirect(url_for("index"))

    return render_template("login.html", register=True)


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"))


@auth_bp.route("/api/replays/save", methods=["POST"])
@login_required
def save_replay():
    data = request.json or {}
    year = data.get("year")
    event_name = data.get("eventName")
    label = data.get("label", "")

    if not year or not event_name:
        return {"error": "Missing year or eventName"}, 400

    replay = SavedReplay(
        user_id=current_user.id,
        year=year,
        event_name=event_name,
        label=label
    )
    db.session.add(replay)
    db.session.commit()
    return {"status": "saved", "id": replay.id}


@auth_bp.route("/api/replays/list")
@login_required
def list_replays():
    replays = SavedReplay.query.filter_by(user_id=current_user.id).order_by(
        SavedReplay.created_at.desc()
    ).all()
    return {
        "replays": [
            {
                "id": r.id,
                "year": r.year,
                "eventName": r.event_name,
                "label": r.label,
                "createdAt": r.created_at.isoformat() if r.created_at else None
            }
            for r in replays
        ]
    }


@auth_bp.route("/api/replays/delete/<int:replay_id>", methods=["DELETE"])
@login_required
def delete_replay(replay_id):
    replay = SavedReplay.query.filter_by(id=replay_id, user_id=current_user.id).first()
    if not replay:
        return {"error": "Not found"}, 404
    db.session.delete(replay)
    db.session.commit()
    return {"status": "deleted"}


# ─── JSON API Auth Endpoints (for Next.js frontend) ───

@auth_bp.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        login_user(user)
        return jsonify({"status": "ok", "user": {"id": user.id, "username": user.username}})
    return jsonify({"error": "Invalid username or password."}), 401


@auth_bp.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters."}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken."}), 400

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    login_user(user)
    return jsonify({"status": "ok", "user": {"id": user.id, "username": user.username}})
