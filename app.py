import os
import threading
import logging
from flask import Flask
from config import Config, CACHE_DIR

# ── Centralised FastF1 cache — must happen before any route imports ──────
from services.fastf1_service import init_cache
init_cache(CACHE_DIR)

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
from routes.race_routes import race_bp

try:
    from flask_socketio import SocketIO
except Exception:
    SocketIO = None

app = Flask(__name__)
app.config.from_object(Config)
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
socketio = SocketIO(app, cors_allowed_origins="*") if SocketIO else None

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
app.register_blueprint(race_bp)

with app.app_context():
    db.create_all()


# ── Background pre-warm: load default session so first page load is instant ──
def _prewarm():
    try:
        from services.fastf1_service import get_session
        print("[Pre-warm] Loading 2024 R1 session in background...")
        get_session(2024, 1)
        print("[Pre-warm] Done — Part 1 data is now cached.")
        
        print("[Pre-warm] Loading Replay basic metadata 2024 R1 in background...")
        with app.test_client() as client:
            client.get('/api/replay/basic?year=2024&round=1')
        print("[Pre-warm] Done — Replay data is now cached.")
    except Exception as e:
        print(f"[Pre-warm] Failed (non-fatal): {e}")
        print("[Pre-warm] Done — Replay data is now cached.")
    except Exception as e:
        print(f"[Pre-warm] Failed (non-fatal): {e}")

_prewarm_thread = threading.Thread(target=_prewarm, daemon=True)
_prewarm_thread.start()



# Frontend is now handled by Next.js
# API routes remain mounted via blueprints


if __name__ == "__main__":
    if socketio:
        socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
    else:
        app.run(debug=True, port=5000, threaded=True)
