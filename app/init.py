from flask import Flask, request
from flask_socketio import SocketIO
from flask_cors import CORS
import os
import logging
import sys
import platform
import subprocess
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    handlers=[logging.StreamHandler()])

logger = logging.getLogger('YoutubetoPremiere')

def get_extension_path():
    """Determine the path to the extension directory."""
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check if we're in the 'exec' folder of the extension
    if os.path.basename(script_dir) == 'exec':
        # Parent directory is the extension root
        return os.path.dirname(script_dir)
    
    # Check if we have an 'exec' subdirectory
    exec_dir = os.path.join(script_dir, 'exec')
    if os.path.isdir(exec_dir):
        return script_dir
    
    # Walk up to three levels to find the extension directory
    current_dir = script_dir
    for _ in range(3):
        parent_dir = os.path.dirname(current_dir)
        # Check if there's an exec directory at this level
        if os.path.isdir(os.path.join(parent_dir, 'exec')):
            return parent_dir
        # Check if we're in the 'app' or 'exec' directory
        if os.path.basename(current_dir) in ['app', 'exec']:
            return os.path.dirname(current_dir)
        current_dir = parent_dir
    
    # Default to the current script directory if we couldn't find it
    logger.warning("Could not determine extension path, using script directory")
    return script_dir

def fix_executable_permissions():
    """Fix permissions for macOS executables."""
    if platform.system() != 'Darwin':
        # Only needed on macOS
        return
    
    logger.info("Checking executable permissions on macOS...")
    extension_path = get_extension_path()
    exec_dir = os.path.join(extension_path, 'exec')
    
    # Check for executables
    executables = [
        os.path.join(exec_dir, 'YoutubetoPremiere'),
        os.path.join(exec_dir, 'ffmpeg')
    ]
    
    for exe in executables:
        if os.path.exists(exe):
            try:
                # Make executable
                os.chmod(exe, 0o755)
                logger.info(f"Set executable permissions for {os.path.basename(exe)}")
                
                # Try to remove quarantine attribute if present
                try:
                    subprocess.run(['xattr', '-d', 'com.apple.quarantine', exe], 
                                 check=False, capture_output=True)
                    logger.info(f"Removed quarantine attribute from {os.path.basename(exe)}")
                except (subprocess.SubprocessError, FileNotFoundError):
                    # Ignore errors with xattr command
                    pass
            except Exception as e:
                logger.warning(f"Could not set permissions for {exe}: {str(e)}")
        else:
            logger.warning(f"Executable not found: {exe}")

def find_ffmpeg():
    """Find the ffmpeg executable."""
    system = platform.system()
    extension_path = get_extension_path()
    exec_dir = os.path.join(extension_path, 'exec')
    
    # First look in our exec directory
    if system == 'Windows':
        ffmpeg_path = os.path.join(exec_dir, 'ffmpeg.exe')
    else:
        ffmpeg_path = os.path.join(exec_dir, 'ffmpeg')
    
    # For Windows systems, use a more robust check (avoiding execution)
    if system == 'Windows':
        if os.path.exists(ffmpeg_path) and os.path.getsize(ffmpeg_path) > 1000000:  # File is large enough to be ffmpeg
            logger.info(f"Using bundled ffmpeg: {ffmpeg_path}")
            return ffmpeg_path
    # For Unix systems, check executable permission
    elif os.path.exists(ffmpeg_path) and os.access(ffmpeg_path, os.X_OK):
        logger.info(f"Using bundled ffmpeg: {ffmpeg_path}")
        return ffmpeg_path
    
    # Try to find ffmpeg in PATH
    try:
        if system == 'Windows':
            # On Windows, check for ffmpeg in standard locations
            for path in [
                os.path.join(exec_dir, '_internal', 'ffmpeg.exe'),  # Check in _internal subdirectory
                os.path.join(os.path.dirname(exec_dir), 'exec', 'ffmpeg.exe'),  # Check in parent's exec dir
                os.path.join(os.getenv('ProgramFiles'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
                os.path.join(os.getenv('ProgramFiles(x86)'), 'ffmpeg', 'bin', 'ffmpeg.exe'),
                # Add more common Windows locations here
            ]:
                if os.path.exists(path) and os.path.getsize(path) > 1000000:
                    logger.info(f"Found ffmpeg in system path: {path}")
                    return path
            
            # Check PATH - but on Windows, use a more robust approach
            try:
                result = subprocess.run(['where', 'ffmpeg'], capture_output=True, text=True, shell=True)
                if result.returncode == 0:
                    ffmpeg_path = result.stdout.strip().split('\n')[0]
                    logger.info(f"Found ffmpeg in PATH: {ffmpeg_path}")
                    return ffmpeg_path
            except Exception as e:
                logger.warning(f"Error checking for ffmpeg using 'where': {str(e)}")
        else:
            # On macOS/Linux
            result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True)
            if result.returncode == 0:
                ffmpeg_path = result.stdout.strip()
                logger.info(f"Found ffmpeg in PATH: {ffmpeg_path}")
                return ffmpeg_path
    except Exception as e:
        logger.warning(f"Error checking for ffmpeg in PATH: {str(e)}")
    
    # If we got here, no ffmpeg was found in standard locations.
    # For Windows, do one last check if the bundled ffmpeg.exe exists without testing it
    if system == 'Windows' and os.path.exists(ffmpeg_path):
        logger.warning("Using ffmpeg without validation - may not work correctly")
        return ffmpeg_path
    
    logger.warning("ffmpeg not found! Video processing may not work correctly.")
    return None

def init():
    """Initialize the application."""
    # Get the extension path
    extension_path = get_extension_path()
    logger.info(f"Extension path: {extension_path}")
    
    # Fix executable permissions on macOS
    fix_executable_permissions()
    
    # Find ffmpeg
    ffmpeg_path = find_ffmpeg()
    
    # Initialize any other resources
    
    return {
        'extension_path': extension_path,
        'ffmpeg_path': ffmpeg_path
    }

# Run initialization if this module is executed
if __name__ == '__main__':
    init()

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*", "methods": ["GET", "POST", "OPTIONS"]}})
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='threading',
        ping_timeout=60,
        ping_interval=25000,
        max_http_buffer_size=1e8,
        allow_upgrades=True,
        transports=['polling', 'websocket'],  # Start with polling as default
        always_connect=True,
        reconnection=True,
        reconnection_attempts=-1,  # Use -1 for unlimited reconnection attempts
        reconnection_delay=1000,
        reconnection_delay_max=5000,
        logger=True,
        engineio_logger=True,
        cors_credentials=True
    )
    
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
        logging.info(f"Client connected: {request.sid}")
        return True
        
    @socketio.on('disconnect')
    def handle_disconnect():
        logging.info(f"Client disconnected: {request.sid}")
    
    @socketio.on_error()
    def error_handler(e):
        logging.error(f"SocketIO error: {str(e)}")
        
    return app, socketio
