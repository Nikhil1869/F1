from flask import Flask, render_template
from config import Config
from routes.data_routes import data_bp
from routes.ml_routes import ml_bp
from routes.chat_routes import chat_bp
from routes.replay_routes import replay_bp

app = Flask(__name__)
app.config.from_object(Config)

app.register_blueprint(data_bp)
app.register_blueprint(ml_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(replay_bp)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/replay")
def replay():
    return render_template("replay.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
