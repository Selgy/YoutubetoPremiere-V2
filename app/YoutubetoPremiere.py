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
from utils import load_settings, monitor_premiere_and_shutdown, play_notification_sound, get_temp_dir, clear_temp_files, check_ffmpeg, diagnose_windows_networking, create_windows_firewall_rule
import re
import subprocess
import requests
from pathlib import Path
from init import init
import tempfile
from datetime import datetime

# Check yt-dlp version at startup for debugging
def check_ytdlp_version():
    """Check and log yt-dlp version for debugging purposes"""
    try:
        import yt_dlp
        version = yt_dlp.version.__version__
        logging.info(f"yt-dlp version: {version}")
        
        # DISABLED: CLI version check causes 10-second timeouts with multiple processes
        # This was causing process loops when multiple instances tried to run simultaneously
        # The library version check above is sufficient for debugging
        
        # Also try to get version via CLI for comparison - DISABLED
        # try:
        #     result = subprocess.run([sys.executable, '-m', 'yt_dlp', '--version'], 
        #                           capture_output=True, text=True, timeout=10)
        #     if result.returncode == 0:
        #         cli_version = result.stdout.strip()
        #         logging.info(f"yt-dlp CLI version: {cli_version}")
        #     else:
        #         logging.warning(f"Failed to get yt-dlp CLI version: {result.stderr}")
        # except Exception as e:
        #     logging.warning(f"Could not check yt-dlp CLI version: {e}")
        
        logging.info("yt-dlp successfully loaded: %s", version)
            
        return version
    except ImportError as e:
        logging.error(f"yt-dlp not found: {e}")
        return None
    except Exception as e:
        logging.error(f"Error checking yt-dlp version: {e}")
        return None


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
        if response.status_code == 200:
            logging.info(f"Found existing server running on port {port}")
            return True
    except Exception as e:
        # If request fails, port might be used by another application
        logging.warning(f"Port {port} is in use but health check failed: {e}")
        return False
    
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

# Check yt-dlp version for debugging
ytdlp_version = check_ytdlp_version()
if ytdlp_version:
    logging.info(f'yt-dlp successfully loaded: {ytdlp_version}')
else:
    logging.error('yt-dlp version check failed - this may cause video download issues')

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
if check_server_running(3001):
    logging.info("Server already running on port 3001. Exiting.")
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
        ping_timeout=60,  # Increased timeout for Windows CEP
        ping_interval=25,  # Increased interval for better Windows compatibility
        max_http_buffer_size=50 * 1024 * 1024,  # 50MB
        transports=['polling'],  # Polling only for better CEP compatibility
        logger=False,  # Disable verbose logging
        engineio_logger=False,  # Disable verbose logging
        always_connect=True,
        allow_upgrades=False,  # Disable upgrades for consistency
        cookie=None,
        # Windows CEP optimizations
        compression=False,  # Disable compression for Windows compatibility
        jsonp=False,  # Disable JSONP for security
        manage_session=False,  # Let client manage sessions
        # Handle multiple connections gracefully
        client_manager=None,  # Use default manager
        # Increase connection limits for multiple process scenario
        max_connections=50,  # Allow more concurrent connections
        reconnection_delay=2000,  # 2 second delay between reconnection attempts
        reconnection_delay_max=10000,  # Max 10 second delay
        max_reconnection_attempts=20  # Allow more reconnection attempts
    )

    logging.info("Flask and SocketIO initialized successfully")
except Exception as e:
    logging.critical(f"Failed to initialize Flask/SocketIO: {str(e)}", exc_info=True)
    sys.exit(1)

# Register error handlers
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

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
    app_logger.error(f'SocketIO error: {str(e)}')
    # Attempt to notify client of error
    try:
        socketio.emit('server_error', {'error': str(e)})
    except:
        pass

@socketio.on_error_default
def default_error_handler(e):
    app_logger.error(f'SocketIO default error: {str(e)}')
    # Attempt to notify client of error
    try:
        socketio.emit('server_error', {'error': str(e)})
    except:
        pass

@socketio.on('connect')
def handle_connect():
    sid = request.sid
    client_type = request.args.get('client_type', 'unknown')
    # Don't log client IP for privacy reasons
    
    # Validate client type
    if client_type not in ['chrome', 'premiere']:
        client_type = 'unknown'
        app_logger.warning(f'Connection with unspecified client type')
    
    # For tracking connections, we'll use 'anonymous' instead of IP
    client_key = f'client_{len(connected_clients[client_type])}'
    
    # Add new connection
    connected_clients[client_type][client_key] = sid
    
    app_logger.info(f'Client connected - Type: {client_type}')
    socketio.emit('connection_status', {'status': 'connected'}, room=sid)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    sid = request.sid
    
    # Remove from appropriate client list - find by SID instead of IP
    for client_type, clients in connected_clients.items():
        for client_key, client_sid in list(clients.items()):
            if client_sid == sid:
                del clients[client_key]
                logging.info(f'Client disconnected - Type: {client_type}, SID: {sid}')
                return
    
    # If we get here, the client wasn't found in our tracking
    logging.info(f'Unknown client disconnected - SID: {sid}')

@socketio.on('connection_check')
def handle_connection_check(data):
    """Handle connection check requests from clients"""
    try:
        # This simply responds with a status "ok" message
        # No need to log every connection check
        emit_to_client_type('connection_status', {'status': 'ok'}, request.args.get('client_type'))
    except Exception as e:
        app_logger.error(f'Error in handle_connection_check: {str(e)}')

def emit_to_client_type(event, data, client_type=None):
    """Emit event to specific client type or all if client_type is None"""
    if client_type:
        # Only emit to clients of the specified type
        for sid in connected_clients[client_type].values():
            try:
                socketio.emit(event, data, room=sid)
                # Reduced to debug level to minimize logs
                if event != 'connection_status': # Don't log frequent connection status updates
                    app_logger.debug(f'Emitting {event} to {client_type} client')
            except Exception as e:
                app_logger.error(f'Error emitting to client: {str(e)}')
    else:
        # For backwards compatibility, emit to all if no type specified
        socketio.emit(event, data)
        app_logger.debug(f'Broadcasting {event}')

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

    # Try different binding strategies based on platform
    bind_hosts = ['localhost', '127.0.0.1']
    if sys.platform != 'win32':
        bind_hosts.append('0.0.0.0')  # Only use 0.0.0.0 on non-Windows systems
    
    server_started = False
    bind_host = 'localhost'  # Default
    
    # Try to start server with different host bindings
    for host in bind_hosts:
        try:
            bind_host = host
            logging.info(f'Trying to start server on {bind_host} port 3001')
            
            # Test if port is available
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((host if host != '0.0.0.0' else 'localhost', 3001))
            sock.close()
            
            if result == 0:
                logging.warning(f"Port 3001 already in use on {host}")
                continue
            
            # Start server in thread
            server_thread = threading.Thread(target=lambda: socketio.run(
                app, 
                host=bind_host,
                port=3001,
                debug=False,
                use_reloader=False,
                log_output=False  # Reduce log output for cleaner console
            ))
            server_thread.daemon = True  # Make sure thread dies with main process
            server_thread.start()
            
            # Wait for server to start
            time.sleep(3)
            
            # Test connection to verify server started
            try:
                import requests
                test_url = f'http://localhost:3001/health'
                response = requests.get(test_url, timeout=2)
                if response.status_code == 200:
                    logging.info(f"Server successfully started on {bind_host}:3001")
                    server_started = True
                    break
            except Exception as e:
                logging.warning(f"Failed to verify server on {bind_host}: {e}")
                continue
                
        except Exception as e:
            logging.warning(f"Failed to start server on {bind_host}: {e}")
            continue
    
    if not server_started:
        logging.error("Failed to start server on any available host")
        # Try one last time with emergency settings
        try:
            logging.info("Attempting emergency server start with minimal settings...")
            server_thread = threading.Thread(target=lambda: app.run(
                host='localhost',
                port=3001,
                debug=False,
                use_reloader=False,
                threaded=True
            ))
            server_thread.daemon = True
            server_thread.start()
            time.sleep(2)
        except Exception as e:
            logging.critical(f"Emergency server start also failed: {e}")
            return
    
    # Comprehensive server health check
    max_retries = 15
    health_check_passed = False
    
    for i in range(max_retries):
        try:
            import requests
            
            # Test HTTP health endpoint
            response = requests.get('http://localhost:3001/health', timeout=2)
            if response.status_code == 200:
                logging.info("HTTP health check passed")
                
                # Test if we can get server IP (this tests more routes)
                try:
                    ip_response = requests.get('http://localhost:3001/get-ip', timeout=2)
                    if ip_response.status_code == 200:
                        logging.info("Extended health check passed - all routes working")
                        health_check_passed = True
                        break
                    else:
                        logging.warning(f"Extended health check failed: HTTP {ip_response.status_code}")
                except Exception as e:
                    logging.warning(f"Extended health check failed: {e}")
                    # Basic health passed, so continue anyway
                    health_check_passed = True
                    break
            else:
                logging.warning(f"Health check failed with HTTP {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            if i < max_retries - 1:
                logging.info(f"Server not ready yet, retrying in 1 second... ({i+1}/{max_retries})")
                time.sleep(1)
            else:
                logging.error("Server health check failed - connection refused")
        except Exception as e:
            if i < max_retries - 1:
                logging.info(f"Health check attempt {i+1} failed: {e}, retrying...")
                time.sleep(1)
            else:
                logging.error(f"Server health check failed after {max_retries} attempts: {e}")
    
    if health_check_passed:
        logging.info("Server health check passed - server is ready")
    else:
        logging.warning("Server health check failed, but continuing anyway")
        # On Windows, provide additional troubleshooting info
        if sys.platform == 'win32':
            logging.warning("If connection issues persist on Windows:")
            logging.warning("1. Check Windows Defender Firewall settings")
            logging.warning("2. Check if antivirus software is blocking the connection")
            logging.warning("3. Try running as administrator")
            logging.warning("4. Check if port 3001 is blocked by other software")
            logging.warning("5. Try restarting the application")
    
    # Start monitoring thread
    premiere_monitor_thread = threading.Thread(target=monitor_premiere_and_shutdown_wrapper)
    premiere_monitor_thread.daemon = True
    premiere_monitor_thread.start()

    # Keep main thread alive
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
            percentage = d.get('_percent_str', '0%')
            percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
            # Log progress less frequently - only at certain milestones
            if percentage.strip() in ['0%', '25%', '50%', '75%', '100%']:
                app_logger.info(f'Download progress: {percentage}')
            # Emit only to chrome clients
            emit_to_client_type('percentage', {'percentage': percentage}, 'chrome')
        except Exception as e:
            app_logger.error(f"Error in progress hook: {e}")

def setup_environment():
    """Set up the application environment"""
    try:
        # Initialize all requirements
        config = init()
        
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
        try:
            temp_dir = get_temp_dir()
            clear_temp_files(temp_dir)
            
            # Create necessary directories
            os.makedirs(temp_dir, exist_ok=True)
            logging.info(f"Temp directory ready: {temp_dir}")
        except Exception as e:
            logging.warning(f"Failed to set up temp directory: {str(e)}")
        
        # Run Windows networking diagnostics if on Windows
        if sys.platform == 'win32':
            diagnose_windows_networking()
            
            # Try to create firewall rule (this may fail if not running as admin)
            try:
                create_windows_firewall_rule()
            except Exception as e:
                logging.info(f"Could not create firewall rule (may need admin rights): {e}")
        
        # Log environment info
        logging.info(f"Environment PATH: {os.environ.get('PATH')}")
        logging.info(f"Environment FFMPEG_PATH: {os.environ.get('FFMPEG_PATH')}")
        
        return config
        
    except Exception as e:
        logging.error(f"Error in setup_environment: {str(e)}")
        logging.warning("Continuing with default environment settings")
        # Return a minimal config that allows the server to start
        return {
            'ffmpeg_path': None,
            'temp_dir': None
        }

def check_server_already_running():
    """Check if server is already running on port 3001"""
    try:
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('localhost', 3001))
        sock.close()
        
        if result == 0:
            logging.info("Found existing server running on port 3001")
            return True
        return False
    except Exception as e:
        logging.warning(f"Error checking if server is running: {e}")
        return False

def main():
    """Main function"""
    try:
        # Check if another server is already running
        if check_server_already_running():
            logging.info("Server already running on port 3001. Exiting.")
            sys.exit(0)
        
        setup_environment()
        run_server()
    except KeyboardInterrupt:
        logging.info("Received shutdown signal")
    except Exception as e:
        logging.error(f"Fatal error in main: {e}")
        sys.exit(1)

# Main entry point
if __name__ == "__main__":
    main()
