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
    
    # 1. Check current working directory (CEP often sets this correctly)
    working_dir = os.getcwd()
    
    # If we're already in an exec directory, the parent is the extension root
    if working_dir.endswith('exec'):
        extension_root = os.path.dirname(working_dir)
        if os.path.exists(os.path.join(extension_root, 'CSXS')) or os.path.exists(os.path.join(extension_root, 'manifest.xml')):
            logger.info(f"Detected CEP extension from working directory: {extension_root}")
            return extension_root
    
    # 2. Check for Windows CEP extension paths
    if platform.system() == 'Windows':
        cep_paths = [
            os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions'),
            os.path.join(os.environ.get('APPDATA', ''), 'Adobe', 'CEP', 'extensions'),
        ]
        
        for base_path in cep_paths:
            if os.path.exists(base_path):
                for ext_dir in os.listdir(base_path):
                    if 'Y2P' in ext_dir or 'youtube' in ext_dir.lower() or 'youtubetopremiere' in ext_dir.lower():
                        full_path = os.path.join(base_path, ext_dir)
                        if os.path.exists(os.path.join(full_path, 'exec')):
                            logger.info(f"Found Windows CEP extension: {full_path}")
                            return full_path
    
    # 3. Check for macOS CEP extension paths
    elif platform.system() == 'Darwin':
        cep_paths = [
            "/Library/Application Support/Adobe/CEP/extensions",
            os.path.expanduser("~/Library/Application Support/Adobe/CEP/extensions"),
        ]
        
        for base_path in cep_paths:
            if os.path.exists(base_path):
                for ext_dir in os.listdir(base_path):
                    if 'Y2P' in ext_dir or 'youtube' in ext_dir.lower() or 'youtubetopremiere' in ext_dir.lower():
                        full_path = os.path.join(base_path, ext_dir)
                        if os.path.exists(os.path.join(full_path, 'exec')):
                            logger.info(f"Found macOS CEP extension: {full_path}")
                            return full_path
    
    # 4. Fall back to development path detection
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
    
    # Check for executables in multiple locations
    executables = [
        os.path.join(exec_dir, 'YoutubetoPremiere'),
        os.path.join(exec_dir, 'ffmpeg'),
        os.path.join(exec_dir, '_internal', 'ffmpeg'),
        os.path.join(exec_dir, 'MacOS', 'ffmpeg'),
        os.path.join(exec_dir, 'Contents', 'MacOS', 'ffmpeg'),
        os.path.join(extension_path, 'ffmpeg'),
        os.path.join(extension_path, 'MacOS', 'ffmpeg'),
        os.path.join(extension_path, 'Contents', 'MacOS', 'ffmpeg'),
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
    
    # Define ffmpeg filename based on system
    if system == 'Windows':
        ffmpeg_name = 'ffmpeg.exe'
    else:
        ffmpeg_name = 'ffmpeg'
    
    # Look in multiple possible locations in order of preference
    possible_locations = [
        os.path.join(exec_dir, ffmpeg_name),               # Direct exec directory (highest priority)
        os.path.join(exec_dir, '_internal', ffmpeg_name),  # PyInstaller _internal directory
        os.path.join(extension_path, ffmpeg_name),         # Extension root
        os.path.join(extension_path, 'exec', ffmpeg_name), # Explicit exec subfolder
    ]
    
    # On macOS, add additional specific locations including CEP-specific paths
    if system == 'Darwin':
        possible_locations.extend([
            os.path.join(exec_dir, 'MacOS', ffmpeg_name),          # App bundle MacOS directory
            os.path.join(exec_dir, 'Contents', 'MacOS', ffmpeg_name), # Full app bundle path
            os.path.join(extension_path, 'MacOS', ffmpeg_name),    # Extension MacOS directory
            os.path.join(extension_path, 'Contents', 'MacOS', ffmpeg_name), # Extension app bundle path
            # Additional macOS CEP-specific locations
            os.path.join(exec_dir, 'Resources', ffmpeg_name),      # PyInstaller Resources directory
            os.path.join(exec_dir, 'Frameworks', ffmpeg_name),     # App bundle Frameworks
            os.path.join(extension_path, 'Resources', ffmpeg_name), # Extension Resources
            # Common macOS application paths
            '/Applications/YoutubetoPremiere.app/Contents/MacOS/ffmpeg',
            '/Applications/YoutubetoPremiere.app/Contents/Resources/ffmpeg',
        ])
    
    # Add current working directory if it's an exec directory
    working_dir = os.getcwd()
    if working_dir.endswith('exec'):
        possible_locations.insert(0, os.path.join(working_dir, ffmpeg_name))
    
    for ffmpeg_path in possible_locations:
        logger.info(f"Checking for ffmpeg at: {ffmpeg_path}")
        
        if os.path.exists(ffmpeg_path):
            # For Windows systems, use a more robust check (avoiding execution)
            if system == 'Windows':
                file_size = os.path.getsize(ffmpeg_path)
                if file_size > 1000000:  # File is large enough to be ffmpeg
                    logger.info(f"Found ffmpeg (Windows): {ffmpeg_path} (size: {file_size} bytes)")
                    return ffmpeg_path
                else:
                    logger.warning(f"Found ffmpeg at {ffmpeg_path} but size is suspiciously small: {file_size} bytes")
            # For Unix systems, check executable permission
            else:
                if os.access(ffmpeg_path, os.X_OK):
                    logger.info(f"Found ffmpeg (Unix): {ffmpeg_path}")
                    return ffmpeg_path
                else:
                    logger.warning(f"Found ffmpeg but not executable: {ffmpeg_path}")
    
    logger.info("FFmpeg not found in bundled locations, checking system PATH...")
    
    # Try to find ffmpeg in PATH
    try:
        if system == 'Windows':
            # Check PATH - but on Windows, use a more robust approach
            try:
                result = subprocess.run(['where', 'ffmpeg'], capture_output=True, text=True, shell=True)
                if result.returncode == 0:
                    ffmpeg_path = result.stdout.strip().split('\n')[0]
                    if os.path.exists(ffmpeg_path) and os.path.getsize(ffmpeg_path) > 1000000:
                        logger.info(f"Found ffmpeg in PATH: {ffmpeg_path}")
                        return ffmpeg_path
            except Exception as e:
                logger.warning(f"Error checking for ffmpeg using 'where': {str(e)}")
                
            # Additional Windows-specific fallback locations
            fallback_paths = []
            if os.getenv('ProgramFiles'):
                fallback_paths.append(os.path.join(os.getenv('ProgramFiles'), 'ffmpeg', 'bin', 'ffmpeg.exe'))
            if os.getenv('ProgramFiles(x86)'):
                fallback_paths.append(os.path.join(os.getenv('ProgramFiles(x86)'), 'ffmpeg', 'bin', 'ffmpeg.exe'))
                
            for path in fallback_paths:
                if os.path.exists(path) and os.path.getsize(path) > 1000000:
                    logger.info(f"Found ffmpeg in fallback location: {path}")
                    return path
        else:
            # On macOS/Linux - try multiple ways to find ffmpeg
            try:
                # First try 'which' command
                result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout.strip():
                    ffmpeg_path = result.stdout.strip()
                    # Verify the found ffmpeg actually works
                    try:
                        test_result = subprocess.run([ffmpeg_path, '-version'], 
                                                   capture_output=True, text=True, timeout=5)
                        if test_result.returncode == 0 and 'ffmpeg version' in test_result.stdout:
                            logger.info(f"Found working ffmpeg in PATH: {ffmpeg_path}")
                            return ffmpeg_path
                    except:
                        logger.warning(f"Found ffmpeg in PATH but it doesn't work: {ffmpeg_path}")
                
                # If 'which' fails or ffmpeg doesn't work, try 'whereis'
                result = subprocess.run(['whereis', 'ffmpeg'], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout.strip():
                    # Parse whereis output which looks like "ffmpeg: /usr/bin/ffmpeg"
                    output_parts = result.stdout.strip().split()
                    for part in output_parts[1:]:  # Skip the first part which is "ffmpeg:"
                        if os.path.exists(part) and os.access(part, os.X_OK):
                            try:
                                test_result = subprocess.run([part, '-version'], 
                                                           capture_output=True, text=True, timeout=5)
                                if test_result.returncode == 0 and 'ffmpeg version' in test_result.stdout:
                                    logger.info(f"Found working ffmpeg via whereis: {part}")
                                    return part
                            except:
                                continue
                
                # If still not found, try common homebrew paths on macOS
                if system == 'Darwin':
                    homebrew_paths = [
                        '/opt/homebrew/bin/ffmpeg',  # Apple Silicon Homebrew
                        '/usr/local/bin/ffmpeg',     # Intel Homebrew
                        '/usr/local/Cellar/ffmpeg/*/bin/ffmpeg',
                        '/opt/homebrew/Cellar/ffmpeg/*/bin/ffmpeg'
                    ]
                    
                    import glob
                    for pattern in homebrew_paths:
                        if '*' in pattern:
                            matches = glob.glob(pattern)
                            for match in matches:
                                if os.path.exists(match) and os.access(match, os.X_OK):
                                    try:
                                        test_result = subprocess.run([match, '-version'], 
                                                                   capture_output=True, text=True, timeout=5)
                                        if test_result.returncode == 0 and 'ffmpeg version' in test_result.stdout:
                                            logger.info(f"Found working ffmpeg in Homebrew: {match}")
                                            return match
                                    except:
                                        continue
                        else:
                            if os.path.exists(pattern) and os.access(pattern, os.X_OK):
                                try:
                                    test_result = subprocess.run([pattern, '-version'], 
                                                               capture_output=True, text=True, timeout=5)
                                    if test_result.returncode == 0 and 'ffmpeg version' in test_result.stdout:
                                        logger.info(f"Found working ffmpeg in Homebrew: {pattern}")
                                        return pattern
                                except:
                                    continue
                                    
            except Exception as e:
                logger.warning(f"Error checking for ffmpeg in PATH: {str(e)}")
    except Exception as e:
        logger.warning(f"Error checking for ffmpeg in PATH: {str(e)}")
    
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
