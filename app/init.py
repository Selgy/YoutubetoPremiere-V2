from flask import Flask, request
from flask_socketio import SocketIO
from flask_cors import CORS
import os

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*", "methods": ["GET", "POST", "OPTIONS"]}})
    
    # Determine if we're in development mode
    is_dev = os.environ.get('NODE_ENV') == 'development'
    
    socketio = SocketIO(app, 
                       cors_allowed_origins="*", 
                       async_mode='threading',
                       ping_timeout=60 if is_dev else 120,
                       ping_interval=10000 if is_dev else 25000,
                       max_http_buffer_size=1e8,
                       allow_upgrades=True,
                       transports=['websocket', 'polling'],
                       always_connect=True,
                       reconnection=True,
                       reconnection_attempts=10,
                       reconnection_delay=1000,
                       reconnection_delay_max=5000,
                       logger=True,
                       engineio_logger=True)
    
    # Add CORS headers for all responses
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

    # Handle OPTIONS requests
    @app.route('/', methods=['OPTIONS'])
    @app.route('/<path:path>', methods=['OPTIONS'])
    def options_handler(path=None):
        return '', 200
    
    # Add connection logging
    @socketio.on('connect')
    def handle_connect():
        print(f"Client connected: {request.sid}")
        
    @socketio.on('disconnect')
    def handle_disconnect():
        print(f"Client disconnected: {request.sid}")
        
    return app, socketio
