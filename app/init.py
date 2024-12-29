from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    CORS(app)
    socketio = SocketIO(app, 
                       cors_allowed_origins="*", 
                       async_mode='threading',
                       ping_timeout=20,
                       ping_interval=10,
                       max_http_buffer_size=1e8,
                       allow_upgrades=False,
                       transports=['polling'])
    return app, socketio
