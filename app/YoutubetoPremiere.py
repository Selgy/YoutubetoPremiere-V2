import os
import time
import logging
import threading
import platform
import sys
from flask_cors import CORS
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from routes import register_routes
from utils import load_settings, monitor_premiere_and_shutdown, play_notification_sound
import re

# Configure logging with more detailed format
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.environ.get('TEMP', ''), 'YoutubetoPremiere.log'))
    ]
)

# Track connected clients by type and IP
connected_clients = {
    'chrome': {},    # Chrome extension clients: {ip: sid}
    'premiere': {},  # Premiere Pro extension clients: {ip: sid}
    'unknown': {}    # Unidentified clients: {ip: sid}
}

def get_app_paths():
    """Get all relevant application paths and log them for debugging"""
    paths = {
        'executable': sys.executable,
        'script_dir': os.path.dirname(os.path.abspath(__file__)),
        'working_dir': os.getcwd(),
        'temp_dir': os.environ.get('TEMP', ''),
        'extension_root': os.environ.get('EXTENSION_ROOT', '')
    }
    
    for key, path in paths.items():
        logging.info(f'{key}: {path}')
        if os.path.exists(path):
            logging.info(f'{key} exists: True')
        else:
            logging.warning(f'{key} exists: False')
    
    return paths

# Log system information
logging.info(f'Python version: {sys.version}')
logging.info(f'Platform: {platform.platform()}')
logging.info(f'Process ID: {os.getpid()}')

# Get and log all application paths
paths = get_app_paths()

# Add ffmpeg to PATH
script_dir = paths['script_dir']
ffmpeg_dir = os.path.join(script_dir, 'app')
os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")

try:
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*", "methods": ["GET", "POST", "OPTIONS"]}})

    # Configure Flask for better handling of polling requests
    app.config['SECRET_KEY'] = 'secret!'
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max-limit
    app.config['PROPAGATE_EXCEPTIONS'] = True

    socketio = SocketIO(app, 
                       cors_allowed_origins="*",
                       async_mode='threading',
                       logger=False,
                       engineio_logger=False,
                       ping_timeout=60,
                       ping_interval=25,
                       max_http_buffer_size=1e8,
                       allow_upgrades=True,
                       transports=['polling', 'websocket'],
                       always_connect=True,
                       manage_session=True,
                       cookie=None,
                       reconnection=True,
                       reconnection_attempts=5,
                       reconnection_delay=1000)

    logging.info("Flask and SocketIO initialized successfully")
except Exception as e:
    logging.critical(f"Failed to initialize Flask/SocketIO: {str(e)}", exc_info=True)
    sys.exit(1)

# Add error handlers for common issues
@app.errorhandler(Exception)
def handle_error(e):
    logging.error(f'Server error: {str(e)}')
    return jsonify(error=str(e)), 500

@socketio.on_error()
def error_handler(e):
    logging.error(f'SocketIO error: {str(e)}')
    # Attempt to notify client of error
    try:
        socketio.emit('server_error', {'error': str(e)})
    except:
        pass

@socketio.on_error_default
def default_error_handler(e):
    logging.error(f'SocketIO default error: {str(e)}')
    # Attempt to notify client of error
    try:
        socketio.emit('server_error', {'error': str(e)})
    except:
        pass

@socketio.on('connect')
def handle_connect():
    sid = request.sid
    client_type = request.args.get('client_type', 'unknown')
    client_ip = request.remote_addr
    
    # Validate client type
    if client_type not in ['chrome', 'premiere']:
        logging.warning(f'Rejecting connection with invalid client type: {client_type}')
        return False
    
    # Check if this IP already has a connection of this type
    existing_sid = connected_clients[client_type].get(client_ip)
    if existing_sid:
        # If the existing connection is still active, reject the new one
        if socketio.server.manager.is_connected(existing_sid):
            logging.warning(f'Rejecting duplicate connection from {client_ip} for {client_type}')
            return False
        # If the existing connection is dead, remove it
        else:
            del connected_clients[client_type][client_ip]
    
    # Add new connection
    connected_clients[client_type][client_ip] = sid
    
    logging.info(f'Client connected - Type: {client_type}, SID: {sid}, IP: {client_ip}')
    try:
        emit_to_client_type('connection_established', {'status': 'connected'}, client_type)
    except Exception as e:
        logging.error(f'Error in handle_connect: {str(e)}')

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    client_ip = request.remote_addr
    
    # Remove from appropriate client list
    for client_type, clients in connected_clients.items():
        if client_ip in clients and clients[client_ip] == sid:
            del clients[client_ip]
            logging.info(f'Client disconnected - Type: {client_type}, SID: {sid}, IP: {client_ip}')
            break

@socketio.on('connection_check')
def handle_connection_check():
    try:
        emit_to_client_type('connection_status', {'status': 'ok'}, request.args.get('client_type'))
    except Exception as e:
        logging.error(f'Error in handle_connection_check: {str(e)}')

def emit_to_client_type(event, data, client_type=None):
    """Emit event to specific client type or all if client_type is None"""
    if client_type:
        # Only emit to clients of the specified type
        for sid in connected_clients[client_type].values():
            try:
                socketio.emit(event, data, room=sid)
                logging.debug(f'Emitting {event} to {client_type} client {sid}')
            except Exception as e:
                logging.error(f'Error emitting to client {sid}: {str(e)}')
    else:
        # For backwards compatibility, emit to all if no type specified
        socketio.emit(event, data)
        logging.debug(f'Broadcasting {event} to all clients')

@socketio.on('percentage')
def handle_percentage(data):
    """Forward progress only to Chrome extension"""
    emit_to_client_type('percentage', data, 'chrome')

@socketio.on('import_video')
def handle_import_video(data):
    """Forward import events only to Premiere extension"""
    emit_to_client_type('import_video', data, 'premiere')

@socketio.on('download-complete')
def handle_download_complete():
    """Notify only Chrome extension of download completion"""
    emit_to_client_type('download-complete', {}, 'chrome')

@socketio.on('import_complete')
def handle_import_complete(data):
    """Handle import completion events"""
    success = data.get('success', False)
    path = data.get('path', '')
    if success:
        logging.info(f'Successfully imported video: {path}')
        settings = load_settings()
        volume = settings.get('notificationVolume', 30) / 100
        sound_type = settings.get('notificationSound', 'default')
        play_notification_sound(volume=volume, sound_type=sound_type)
        # Notify Premiere extension of import status
        emit_to_client_type('import_status', {'success': True, 'message': 'Video imported successfully'}, 'premiere')
        # Notify Chrome extension to update UI
        emit_to_client_type('import_success', {'path': path}, 'chrome')
    else:
        error = data.get('error', 'Unknown error')
        logging.error(f'Failed to import video: {path}. Error: {error}')
        # Notify Premiere extension of import status
        emit_to_client_type('import_status', {'success': False, 'message': f'Import failed: {error}'}, 'premiere')
        # Notify Chrome extension of failure
        emit_to_client_type('import_failed', {'path': path, 'error': error}, 'chrome')

@socketio.on('get_project_path')
def handle_get_project_path():
    logging.info('Requesting project path from panel')
    emit_to_client_type('request_project_path', {}, 'premiere')

should_shutdown = False

def run_server():
    global socketio  # Make socketio accessible to progress_hook
    settings = load_settings()
    logging.info('Settings loaded: %s', settings)
    register_routes(app, socketio, settings)

    server_thread = threading.Thread(target=lambda: socketio.run(
        app, 
        host='localhost', 
        port=3001,
        debug=False,
        use_reloader=False
    ))
    server_thread.start()

    premiere_monitor_thread = threading.Thread(target=monitor_premiere_and_shutdown_wrapper)
    premiere_monitor_thread.start()

    while not should_shutdown:
        time.sleep(1)

    logging.info("Shutting down the application.")
    os._exit(0)

def monitor_premiere_and_shutdown_wrapper():
    global should_shutdown
    monitor_premiere_and_shutdown()
    should_shutdown = True

def run_extendscript(script):
    try:
        script_path = os.path.join(os.environ['TEMP'], 'YoutubetoPremiere_script.jsx')
        result_path = os.path.join(os.environ['TEMP'], 'YoutubetoPremiere_result.txt')

        # Remove any existing result file
        if os.path.exists(result_path):
            try:
                os.remove(result_path)
            except:
                pass

        # Write the script
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script)

        # Wait for the result file to be created by the panel extension
        timeout = 30  # 30 seconds timeout
        start_time = time.time()
        while not os.path.exists(result_path):
            if time.time() - start_time > timeout:
                raise TimeoutError("Timeout waiting for ExtendScript result")
            time.sleep(0.1)

        # Give a small delay to ensure the file is completely written
        time.sleep(0.1)

        # Read the result
        try:
            with open(result_path, 'r', encoding='utf-8') as f:
                result = f.read().strip()
            return result
        except Exception as e:
            logging.error(f"Error reading result file: {e}")
            return None

    except Exception as e:
        logging.error(f'Error running ExtendScript: {e}')
        return None
    finally:
        # Clean up
        for file_path in [script_path, result_path]:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass

def progress_hook(d, socketio):
    if d['status'] == 'downloading':
        try:
            percentage = d.get('_percent_str', '0%')
            percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
            # Log only once
            logging.info(f'Progress: {percentage}')
            # Emit only to chrome clients
            emit_to_client_type('percentage', {'percentage': percentage}, 'chrome')
        except Exception as e:
            logging.error(f"Error in progress hook: {e}")

if __name__ == "__main__":
    run_server()
