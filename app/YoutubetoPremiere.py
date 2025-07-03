import os
import time
import logging
import threading
import platform
import sys
import socket
from flask_cors import CORS
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from routes import register_routes
from utils import load_settings, monitor_premiere_and_shutdown, play_notification_sound, get_temp_dir, clear_temp_files, check_ffmpeg
import re
import subprocess
import requests
from pathlib import Path
import app_init
import tempfile
from datetime import datetime


# Determine log directory
if sys.platform == 'win32':
    log_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
else:
    log_dir = os.path.join(tempfile.gettempdir(), 'YoutubetoPremiere')

# Create log directory if it doesn't exist
os.makedirs(log_dir, exist_ok=True)

# Set up log files
main_log_file = os.path.join(log_dir, 'YoutubetoPremiere.log')
error_log_file = os.path.join(log_dir, 'errors.log')

# Clear previous logs at session start
def clear_previous_logs():
    """Clear log files from previous sessions"""
    try:
        # Clear main log file
        if os.path.exists(main_log_file):
            with open(main_log_file, 'w', encoding='utf-8') as f:
                f.write('')
        
        # Clear error log file  
        if os.path.exists(error_log_file):
            with open(error_log_file, 'w', encoding='utf-8') as f:
                f.write('')
        
        # Clear video processing error log if it exists
        video_error_log = os.path.join(log_dir, 'video_processing_errors.log')
        if os.path.exists(video_error_log):
            with open(video_error_log, 'w', encoding='utf-8') as f:
                f.write('')
                
        print(f"Previous logs cleared for new session")
    except Exception as e:
        print(f"Warning: Could not clear previous logs: {e}")

# Clear logs before setting up new logging
clear_previous_logs()

# Configure logging with file and console handlers
console_handler = logging.StreamHandler(sys.stdout)
main_file_handler = logging.FileHandler(main_log_file, mode='a', encoding='utf-8')
error_file_handler = logging.FileHandler(error_log_file, mode='a', encoding='utf-8')

# Set levels for handlers
console_handler.setLevel(logging.INFO)
main_file_handler.setLevel(logging.INFO)
error_file_handler.setLevel(logging.ERROR)

# Set formatter
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console_handler.setFormatter(formatter)
main_file_handler.setFormatter(formatter)
error_file_handler.setFormatter(formatter)

# Force immediate flush for file handlers (important for PyInstaller)
class FlushFileHandler(logging.FileHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

# Replace file handlers with flushing versions
main_file_handler = FlushFileHandler(main_log_file, mode='a', encoding='utf-8')
error_file_handler = FlushFileHandler(error_log_file, mode='a', encoding='utf-8')

# Set levels and formatters again
main_file_handler.setLevel(logging.INFO)
error_file_handler.setLevel(logging.ERROR)
main_file_handler.setFormatter(formatter)
error_file_handler.setFormatter(formatter)

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    handlers=[console_handler, main_file_handler, error_file_handler],
    force=True  # Force reconfiguration
)

# Store log directory for later use
os.environ['YTPP_LOG_DIR'] = log_dir

def write_test_log():
    """Write a test log to verify file logging works"""
    try:
        # Write session header and test to main log
        session_header = f"""
{'='*60}
SESSION STARTED: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
YouTube to Premiere Pro Extension v3.0.1
{'='*60}
"""
        with open(main_log_file, 'a', encoding='utf-8') as f:
            f.write(session_header)
            f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - TEST - INFO - Logging system initialized\n")
            f.flush()
        
        # Write session header to error log
        with open(error_log_file, 'a', encoding='utf-8') as f:
            f.write(session_header)
            f.write(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - TEST - ERROR - Error logging initialized\n")
            f.flush()
    except Exception as e:
        print(f"Failed to write test log: {e}")

# Test direct file writing first
write_test_log()

logging.info(f"Logging initialized. Log directory: {log_dir}")
logging.info(f"Main log file: {main_log_file}")
logging.info(f"Error log file: {error_log_file}")

# Force an error log to test error handler
logging.error("Test error log entry - this should appear in errors.log")

# Manual flush of all handlers
for handler in logging.getLogger().handlers:
    if hasattr(handler, 'flush'):
        handler.flush()

# Set higher log levels for verbose libraries
logging.getLogger('engineio.server').setLevel(logging.ERROR)
logging.getLogger('socketio.server').setLevel(logging.ERROR)
logging.getLogger('werkzeug').setLevel(logging.ERROR)

# Log only important app events
app_logger = logging.getLogger('app')
app_logger.setLevel(logging.INFO)

# Track connected clients by type and IP
connected_clients = {
    'chrome': {},    # Chrome extension clients: {ip: sid}
    'premiere': {},  # Premiere Pro extension clients: {ip: sid}
    'unknown': {}    # Unidentified clients: {ip: sid}
}

def is_port_in_use(port, host='localhost'):
    """Check if a port is already in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except socket.error:
            return True

def check_server_running(port=3001):
    """Check if server is already running by testing if the port is in use and if API responds"""
    # First check if port is in use
    if not is_port_in_use(port):
        return False
        
    # Then try to connect to health endpoint
    try:
        import requests
        response = requests.get(f'http://localhost:{port}/health', timeout=1)
        return response.status_code == 200
    except:
        # If request fails, port might be used by another application
        return False

def get_app_paths():
    """Get all relevant application paths and log them for debugging"""
    paths = {
        'executable': sys.executable,
        'script_dir': os.path.dirname(os.path.abspath(__file__)),
        'working_dir': os.getcwd(),
        'temp_dir': os.environ.get('TEMP' if sys.platform == 'win32' else 'TMPDIR', '/tmp'),
        'extension_root': os.environ.get('EXTENSION_ROOT', '')
    }
    
    # Helper function to sanitize paths - hide username and other sensitive info
    def sanitize_path(path):
        if not path:
            return path
        # Replace username with [USER] in paths
        import re
        # Match common user directory patterns - escape backslashes properly
        patterns = [
            (r'C:\\Users\\[^\\]+', r'C:\\Users\\[USER]'),
            (r'/Users/[^/]+', r'/Users/[USER]'),
            (r'/home/[^/]+', r'/home/[USER]'),
        ]
        sanitized = path
        for pattern, replacement in patterns:
            sanitized = re.sub(pattern, replacement, sanitized)
        return sanitized
    
    for key, path in paths.items():
        sanitized_path = sanitize_path(path)
        logging.info(f'{key}: {sanitized_path}')
        if os.path.exists(path):
            logging.info(f'{key} exists: True')
        else:
            logging.warning(f'{key} exists: False')
    
    return paths

# Log system information
logging.info(f'Python version: {sys.version}')
logging.info(f'Platform: {platform.platform()}')
logging.info(f'Process ID: {os.getpid()}')

# Get and log all application paths (but hide sensitive user paths)
paths = get_app_paths()

# Add ffmpeg to PATH - look in multiple possible locations
script_dir = paths['script_dir']
possible_ffmpeg_locations = [
    os.path.dirname(script_dir),  # Parent directory
    script_dir,  # Current directory
    os.path.join(script_dir, 'ffmpeg'),  # ffmpeg subdirectory
    os.path.join(os.path.dirname(script_dir), 'ffmpeg'),  # Parent's ffmpeg subdirectory
    os.path.join(os.path.dirname(script_dir), 'exec'),  # exec subdirectory
    os.path.join(os.path.dirname(os.path.dirname(script_dir)), 'exec'),  # Parent's exec subdirectory
]

# Add macOS specific paths
if sys.platform == 'darwin':
    possible_ffmpeg_locations.extend([
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        os.path.expanduser('~/bin')
    ])

# Add extension root path if available
extension_root = os.environ.get('EXTENSION_ROOT', '')
if extension_root:
    possible_ffmpeg_locations.extend([
        extension_root,
        os.path.join(extension_root, 'exec'),
    ])

ffmpeg_found = False
ffmpeg_binary = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
for ffmpeg_dir in possible_ffmpeg_locations:
    if os.path.exists(os.path.join(ffmpeg_dir, ffmpeg_binary)):
        # Safely handle PATH environment variable
        current_path = os.environ.get("PATH", "")
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
        logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")
        ffmpeg_found = True
        break

if not ffmpeg_found:
    logging.error("FFmpeg not found in any of the expected locations")

# Check if the server is already running before starting
if check_server_running(3002):
    logging.info("Server already running on port 3002. Exiting.")
    print("YoutubetoPremiere server is already running.")
    # Don't exit immediately if running in development mode
    if not getattr(sys, 'frozen', False):
        print("Running in development mode, press Ctrl+C to exit.")
    else:
        sys.exit(0)

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
        ping_timeout=60,  # Reduced from 120 to avoid long-hanging connections
        ping_interval=25,  # Reduced from 25000 to 25 seconds for more frequent pings
        max_http_buffer_size=50 * 1024 * 1024,  # Reduced from 100MB to 50MB
        transports=['websocket', 'polling'],
        logger=False,
        engineio_logger=False,
        always_connect=False,  # Changed to False to avoid automatic connections
        reconnection=True,
        reconnection_attempts=5,  # Limited to 5 attempts instead of unlimited
        reconnection_delay=1000,
        reconnection_delay_max=5000,
        allow_upgrades=True,
        cookie=None,
        manage_session=False  # Added to avoid session management issues
    )

    logging.info("Flask and SocketIO initialized successfully")
except Exception as e:
    logging.critical(f"Failed to initialize Flask/SocketIO: {str(e)}", exc_info=True)
    sys.exit(1)

# Register error handlers
@app.errorhandler(404)
def not_found_error(error):
    try:
        return jsonify({'error': 'Not found'}), 404
    except Exception as e:
        return "Not found", 404

@app.errorhandler(500)
def internal_error(error):
    try:
        return jsonify({'error': 'Internal server error'}), 500
    except Exception as e:
        return "Internal server error", 500

# Add handler for Werkzeug assertion errors
@app.errorhandler(AssertionError)
def handle_assertion_error(error):
    app_logger.error(f'Assertion error: {str(error)}')
    try:
        return jsonify({'error': 'Request processing error'}), 500
    except:
        return "Request processing error", 500

# Enable CORS
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

@socketio.on_error()
def error_handler(e):
    try:
        app_logger.error(f'🔥 SocketIO error: {str(e)}')
        app_logger.error(f'🔥 Error type: {type(e).__name__}')
        if hasattr(request, "sid") and request.sid:
            app_logger.error(f'🔥 Request SID: {request.sid[:8]}...')
    except Exception as log_error:
        # Fallback logging if request context is not available
        print(f'SocketIO error (context unavailable): {str(e)}')

@socketio.on_error_default
def default_error_handler(e):
    try:
        app_logger.error(f'🔥 SocketIO default error: {str(e)}')
        app_logger.error(f'🔥 Default error type: {type(e).__name__}')
        if hasattr(request, "sid") and request.sid:
            app_logger.error(f'🔥 Request SID: {request.sid[:8]}...')
    except Exception as log_error:
        # Fallback logging if request context is not available
        print(f'SocketIO default error (context unavailable): {str(e)}')

# Add pre-connection debugging
@app.before_request
def log_request_info():
    if request.path.startswith('/socket.io/'):
        app_logger.info(f'🌐 SocketIO request: {request.method} {request.path}')
        app_logger.info(f'🌐 Headers: User-Agent={request.headers.get("User-Agent", "unknown")[:50]}...')
        app_logger.info(f'🌐 Query params: {dict(request.args)}')
        app_logger.info(f'🌐 Remote addr: {request.environ.get("REMOTE_ADDR", "unknown")}')

@socketio.on('connect')
def handle_connect():
    try:
        sid = request.sid
        client_type = request.args.get('client_type', 'unknown')
        # Don't log client IP for privacy reasons
        
        app_logger.info(f'🔌 New connection attempt - SID: {sid[:8]}...')
        app_logger.info(f'🔌 Raw request.args: {dict(request.args)}')
        app_logger.info(f'🔌 client_type parameter: "{client_type}"')
        
        # Validate client type
        if client_type not in ['chrome', 'premiere']:
            original_client_type = client_type
            client_type = 'unknown'
            app_logger.warning(f'[WARN] Invalid client type "{original_client_type}", setting to "unknown"')
        else:
                          app_logger.info(f'[INFO] Valid client type: "{client_type}"')
        
        # For tracking connections, use SID as key to avoid conflicts
        client_key = sid
        
        # Remove any existing entries with the same SID first (in case of reconnection)
        for ctype, clients in connected_clients.items():
            if sid in clients:
                del clients[sid]
                app_logger.info(f'🔄 Removed old entry for SID {sid[:8]}... from {ctype}')
        
        # Add new connection
        connected_clients[client_type][client_key] = sid
        
        app_logger.info(f'[CONNECTED] Client connected - Type: {client_type}, SID: {sid[:8]}..., Key: {client_key}')
        app_logger.info(f'[STATS] Current connected clients: chrome={len(connected_clients["chrome"])}, premiere={len(connected_clients["premiere"])}, unknown={len(connected_clients["unknown"])}')
        app_logger.info(f'[DEBUG] connected_clients structure: {dict([(k, list(v.keys())) for k, v in connected_clients.items()])}')
        
        # Send connection status safely
        try:
            socketio.emit('connection_status', {'status': 'connected', 'client_type': client_type}, room=sid)
        except Exception as emit_error:
            app_logger.warning(f'Could not send connection_status to {sid[:8]}...: {emit_error}')
            
    except Exception as e:
        app_logger.error(f'Error in handle_connect: {str(e)}', exc_info=True)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    try:
        sid = request.sid
        
        # Remove from appropriate client list - since we now use SID as key, this is simpler
        for client_type, clients in connected_clients.items():
            if sid in clients:
                del clients[sid]
                app_logger.info(f'🔌 Client disconnected - Type: {client_type}, SID: {sid[:8]}...')
                app_logger.info(f'📊 Remaining connected clients: chrome={len(connected_clients["chrome"])}, premiere={len(connected_clients["premiere"])}, unknown={len(connected_clients["unknown"])}')
                return
        
        # If we get here, the client wasn't found in our tracking
        app_logger.warning(f'[WARN] Unknown client disconnected - SID: {sid[:8]}... (not found in tracking)')
        
    except Exception as e:
        app_logger.error(f'Error in handle_disconnect: {str(e)}', exc_info=True)

@socketio.on('connection_check')
def handle_connection_check(data):
    """Handle connection check requests from clients"""
    try:
        client_type = request.args.get('client_type')
        sid = request.sid
        app_logger.info(f'[CHECK] CONNECTION_CHECK: Client type={client_type}, SID={sid[:8]}..., Data={data}')
        
        # This simply responds with a status "ok" message
        socketio.emit('connection_status', {'status': 'ok', 'client_type': client_type}, room=sid)
        app_logger.info(f'[SENT] connection_status to SID {sid[:8]}... (type: {client_type})')
    except Exception as e:
        app_logger.error(f'Error in handle_connection_check: {str(e)}')

def emit_to_client_type(event, data, client_type=None):
    """Emit event to specific client type or all if client_type is None"""
    if client_type:
        # Only emit to clients of the specified type
        connected_clients_count = len(connected_clients[client_type])
        app_logger.info(f'[DEBUG] Checking {client_type} clients - found {connected_clients_count} connected')
        app_logger.info(f'[DEBUG] All connected clients: {dict([(k, len(v)) for k, v in connected_clients.items()])}')
        app_logger.info(f'[DEBUG] {client_type} client SIDs: {list(connected_clients[client_type].keys())}')
        
        if connected_clients_count == 0:
            app_logger.warning(f'[WARN] No {client_type} clients connected to send {event} event!')
            app_logger.info(f'[DEBUG] Available client types: {list(connected_clients.keys())}')
            app_logger.info(f'[DEBUG] Full connected_clients structure: {connected_clients}')
            return
            
        app_logger.info(f'[INFO] Found {connected_clients_count} {client_type} clients connected')
        # Make a copy of SIDs to avoid modification during iteration
        client_sids = list(connected_clients[client_type].keys())
        successful_sends = 0
        
        for sid in client_sids:
            try:
                # Check if SID still exists (might have been removed during iteration)
                if sid not in connected_clients[client_type]:
                    continue
                    
                socketio.emit(event, data, room=sid)
                successful_sends += 1
                
                # Log progress and percentage events at INFO level for debugging
                if event in ['progress', 'percentage']:
                    app_logger.info(f'[SENT] {event} to {client_type} client (SID: {sid[:8]}...): {data}')
                    
                    # Also send legacy format for old scripts compatibility
                    if event == 'progress' and 'progress' in data:
                        try:
                            legacy_data = {'percentage': str(data['progress']) + '%'}
                            socketio.emit('percentage', legacy_data, room=sid)
                            app_logger.info(f'[SENT] legacy percentage to {client_type} client: {legacy_data}')
                        except Exception as legacy_error:
                            app_logger.warning(f'Could not send legacy percentage: {legacy_error}')
                            
                elif event != 'connection_status': # Don't log frequent connection status updates
                    app_logger.debug(f'Emitting {event} to {client_type} client')
                    
            except Exception as e:
                app_logger.error(f'Error emitting to client SID {sid[:8]}...: {str(e)}')
                # Remove the problematic SID
                try:
                    if sid in connected_clients[client_type]:
                        del connected_clients[client_type][sid]
                        app_logger.info(f'[CLEANUP] Removed problematic SID {sid[:8]}... from {client_type}')
                except Exception as cleanup_error:
                    app_logger.error(f'Error cleaning up SID {sid[:8]}...: {cleanup_error}')
        
        if successful_sends > 0:
            app_logger.info(f'[RESULT] Successfully sent {event} to {successful_sends}/{len(client_sids)} {client_type} clients')
    else:
        # For backwards compatibility, emit to all if no type specified
        socketio.emit(event, data)
        if event in ['progress', 'percentage']:
            app_logger.info(f'[BROADCAST] {event}: {data}')
        else:
            app_logger.debug(f'Broadcasting {event}')

@socketio.on('progress')

@socketio.on('import_video')
def handle_import_video(data):
    """Forward import events only to Premiere extension"""
    try:
        path = data.get('path', '')
        if not path:
            logging.error("No path provided for import")
            emit_to_client_type('import_failed', {'error': 'No path provided'}, 'premiere')
            return
        
        if not os.path.exists(path):
            logging.error(f"File does not exist: {path}")
            emit_to_client_type('import_failed', {'error': 'File not found'}, 'premiere')
            return
            
        logging.info(f"Attempting to import video: {path}")
        emit_to_client_type('import_video', data, 'premiere')
        
        # Add a delay to ensure the message is sent before any potential disconnection
        time.sleep(0.5)
        
    except Exception as e:
        error_msg = f"Error during import: {str(e)}"
        logging.error(error_msg)
        emit_to_client_type('import_failed', {'error': error_msg}, 'premiere')

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
        # Play notification sound
        settings = load_settings()
        volume = settings.get('notificationVolume', 30) / 100
        sound_type = settings.get('notificationSound', 'default')
        play_notification_sound(volume=volume, sound_type=sound_type)
        
        # Forward the complete event to all clients
        socketio.emit('import_complete', data)
    else:
        error = data.get('error', 'Unknown error')
        logging.error(f'Failed to import video: {path}. Error: {error}')
        # Forward the error to all clients
        socketio.emit('import_failed', {'path': path, 'error': error})

@socketio.on('get_project_path')
def handle_get_project_path():
    logging.info('Requesting project path from panel')
    emit_to_client_type('request_project_path', {}, 'premiere')

should_shutdown = False

def run_server():
    global socketio  # Make socketio accessible to progress_hook
    settings = load_settings()
    
    # Create a sanitized version of settings for logging (hide sensitive data)
    settings_for_logging = settings.copy()
    if 'licenseKey' in settings_for_logging and settings_for_logging['licenseKey']:
        # Show only first 4 and last 4 characters of license key
        license_key = settings_for_logging['licenseKey']
        if len(license_key) > 8:
            settings_for_logging['licenseKey'] = f"{license_key[:4]}...{license_key[-4:]}"
        else:
            settings_for_logging['licenseKey'] = "****"
    
    logging.info('Settings loaded: %s', settings_for_logging)
    register_routes(app, socketio, settings)

    # Start server without exposing IP addresses
    logging.info(f'Starting server on all interfaces on port 3002')

    server_thread = threading.Thread(target=lambda: socketio.run(
        app, 
        host='0.0.0.0',  # Bind to all available interfaces
        port=3002,
        debug=False,
        use_reloader=False
    ))
    server_thread.start()
    
    # Browser opening disabled - not needed for CEP extension
    # if sys.platform == 'darwin' and getattr(sys, 'frozen', False):
    #     try:
    #         open_url_in_browser(f'http://localhost:3001/health')
    #     except:
    #         pass

    premiere_monitor_thread = threading.Thread(target=monitor_premiere_and_shutdown_wrapper)
    premiere_monitor_thread.start()

    while not should_shutdown:
        time.sleep(1)

    logging.info("Shutting down the application.")
    os._exit(0)

def open_url_in_browser(url):
    """Open a URL in the default browser"""
    import webbrowser
    import time
    
    # Delay slightly to ensure the server is fully started
    time.sleep(2)
    try:
        webbrowser.open(url)
        logging.info(f"Opened {url} in browser")
    except Exception as e:
        logging.error(f"Failed to open URL in browser: {e}")

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
            import time
            
            # Progress throttling variables for this function
            if not hasattr(progress_hook, 'last_progress_time'):
                progress_hook.last_progress_time = 0
                progress_hook.last_progress_value = 0
            
            percentage_str = d.get('_percent_str', '0%')
            percentage_str = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage_str)
            percentage_str = percentage_str.replace(' ', '').replace('%', '')
            
            if percentage_str.isdigit():
                percentage = int(percentage_str)
                current_time = time.time()
                
                # Throttle progress updates: send every 0.5s OR if progress increased by 5% OR for key values
                time_elapsed = current_time - progress_hook.last_progress_time
                progress_diff = percentage - progress_hook.last_progress_value
                is_key_percentage = percentage in [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]
                
                if (time_elapsed >= 0.5 or progress_diff >= 5 or is_key_percentage or percentage == 0):
                    logging.info(f'Download progress: {percentage}%')
                    # Emit to chrome clients with consistent event format
                    emit_to_client_type('progress', {'progress': str(percentage), 'type': 'full'}, 'chrome')
                    progress_hook.last_progress_time = current_time
                    progress_hook.last_progress_value = percentage
                else:
                    logging.info(f'Skipping Progress: {percentage}% (throttled)')
            
        except Exception as e:
            app_logger.error(f"Error in progress hook: {e}")

def setup_environment():
    """Set up the application environment"""
    # Initialize all requirements
    config = app_init.init()
    
    # Set environment variables
    if config['ffmpeg_path']:
        # Set both the directory and the full path for maximum compatibility
        os.environ['FFMPEG_PATH'] = config['ffmpeg_path']
        
        # Add the directory containing ffmpeg to PATH
        ffmpeg_dir = os.path.dirname(config['ffmpeg_path'])
        if ffmpeg_dir:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
            logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")
            
        # On Windows, create symbolic links to ffmpeg in system temp directory for better accessibility
        if sys.platform == 'win32':
            try:
                temp_dir = get_temp_dir()
                temp_ffmpeg_path = os.path.join(temp_dir, 'ffmpeg.exe')
                if not os.path.exists(temp_ffmpeg_path) and os.path.exists(config['ffmpeg_path']):
                    # Copy ffmpeg to temp directory as symbolink links might not work well in all Windows contexts
                    import shutil
                    shutil.copy2(config['ffmpeg_path'], temp_ffmpeg_path)
                    logging.info(f"Created ffmpeg copy in temp directory: {temp_ffmpeg_path}")
                    
                    # Add temp directory to PATH as well
                    os.environ["PATH"] = temp_dir + os.pathsep + os.environ["PATH"]
            except Exception as e:
                logging.warning(f"Failed to create ffmpeg copy in temp directory: {str(e)}")
    
    # Clear temporary files from previous runs
    temp_dir = get_temp_dir()
    clear_temp_files(temp_dir)
    
    # Create necessary directories
    os.makedirs(temp_dir, exist_ok=True)
    
    # Log environment info
    logging.info(f"Environment PATH: {os.environ.get('PATH')}")
    logging.info(f"Environment FFMPEG_PATH: {os.environ.get('FFMPEG_PATH')}")
    
    return config

def main():
    """Main entry point"""
    try:
        # Set up environment first
        config = setup_environment()
        logging.info(f"Environment setup complete. FFmpeg path: {config.get('ffmpeg_path')}")
        
        # Start the server
        run_server()
    except KeyboardInterrupt:
        logging.info("Server stopped by user")
        print("\nServer stopped by user")
    except Exception as e:
        logging.error(f"Error starting server: {str(e)}")
        print(f"Error starting server: {str(e)}")
        sys.exit(1)

# Main entry point
if __name__ == "__main__":
    main()
