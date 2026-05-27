import os
import threading
from flask import Flask, render_template, redirect, url_for
from flask_login import login_required
from config import Config
from models import db, login_manager
from routes.data_routes import data_bp
from routes.ml_routes import ml_bp
from routes.chat_routes import chat_bp
from routes.replay_routes import replay_bp
from routes.season_routes import season_bp
from routes.fantasy_routes import fantasy_bp
from routes.auth_routes import auth_bp
from routes.h2h_routes import h2h_bp
from routes.laptimes_routes import laptimes_bp
from routes.calendar_routes import calendar_bp

app = Flask(__name__)
app.config.from_object(Config)

basedir = os.path.abspath(os.path.dirname(__file__))
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(basedir, "f1lab.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
login_manager.init_app(app)
login_manager.login_view = "auth.login"

app.register_blueprint(data_bp)
app.register_blueprint(ml_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(replay_bp)
app.register_blueprint(season_bp)
app.register_blueprint(fantasy_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(h2h_bp)
app.register_blueprint(laptimes_bp)
app.register_blueprint(calendar_bp)

with app.app_context():
    db.create_all()


# ── Background pre-warm: load default session so first page load is instant ──
def _prewarm():
    try:
        from routes.data_routes import get_session
        print("[Pre-warm] Loading 2024 R1 session in background...")
        get_session(2024, 1)
        print("[Pre-warm] Done — Part 1 data is now cached.")
        
        print("[Pre-warm] Loading Replay 2024 R1 in background...")
        with app.test_client() as client:
            client.get('/api/replay/load?year=2024&round=1')
        print("[Pre-warm] Done — Replay data is now cached.")
    except Exception as e:
        print(f"[Pre-warm] Failed (non-fatal): {e}")

_prewarm_thread = threading.Thread(target=_prewarm, daemon=True)
_prewarm_thread.start()


@app.route("/")
@login_required
def index():
    return render_template("index.html")


@app.route("/replay")
@login_required
def replay():
    return render_template("replay.html")


@app.route("/login")
def login_page():
    return render_template("login.html")


@app.route("/register")
def register_page():
    return render_template("login.html", register=True)


if __name__ == "__main__":
    app.run(debug=True, port=5000)

