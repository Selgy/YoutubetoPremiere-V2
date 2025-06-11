import os
import json
import psutil
import sys
import platform
import logging
import string
import pygame
import subprocess
import zipfile
import tarfile
import shutil
from tqdm import tqdm
import requests
import threading

import time

def load_settings():
    default_settings = {
        'resolution': '1080',
        'downloadPath': '',
        'downloadMP3': False,
        'secondsBefore': '15',
        'secondsAfter': '15',
        'notificationVolume': 30,
        'notificationSound': 'notification_sound',
        'licenseKey': None,
        'preferredAudioLanguage': 'original',
        'useYouTubeAuth': False,
        'youtubeCookiesStatus': 'not_connected'
    }

    script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    
    settings_path = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~/.config')), 
                                'YoutubetoPremiere', 'settings.json')
    
    if not os.path.exists(os.path.dirname(settings_path)):
        os.makedirs(os.path.dirname(settings_path))

    if os.path.exists(settings_path):
        with open(settings_path, 'r') as f:
            settings = json.load(f)
            # Ensure all default settings exist
            for key, value in default_settings.items():
                if key not in settings:
                    settings[key] = value
    else:
        settings = default_settings
        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=4)

    settings['SETTINGS_FILE'] = settings_path
    
    # Set up FFmpeg
    try:
        settings['ffmpeg_path'] = find_ffmpeg()
        # Add ffmpeg directory to PATH
        ffmpeg_dir = os.path.dirname(settings['ffmpeg_path'])
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
        logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")
        logging.info(f"Using ffmpeg from: {settings['ffmpeg_path']}")
    except Exception as e:
        error_msg = f"Error setting up ffmpeg: {e}"
        logging.error(error_msg)
        settings['ffmpeg_path'] = None
        settings['ffmpeg_error'] = error_msg

    # Create a sanitized version of settings for logging (hide sensitive data)
    settings_for_logging = settings.copy()
    if 'licenseKey' in settings_for_logging and settings_for_logging['licenseKey']:
        # Show only first 4 and last 4 characters of license key
        license_key = settings_for_logging['licenseKey']
        if len(license_key) > 8:
            settings_for_logging['licenseKey'] = f"{license_key[:4]}...{license_key[-4:]}"
        else:
            settings_for_logging['licenseKey'] = "****"

    logging.info(f'Loaded settings: {settings_for_logging}')
    return settings

def save_settings(settings):
    settings_path = settings.get('SETTINGS_FILE')
    if settings_path:
        # Load existing settings first
        existing_settings = {}
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r') as f:
                    existing_settings = json.load(f)
            except:
                pass
        
        # Create a copy of settings without the internal fields
        settings_to_save = settings.copy()
        settings_to_save.pop('SETTINGS_FILE', None)
        settings_to_save.pop('ffmpeg_path', None)
        
        # Update existing settings with new values
        existing_settings.update(settings_to_save)
        
        with open(settings_path, 'w') as f:
            json.dump(existing_settings, f, indent=4)
        return True
    return False

def save_license_key(license_key):
    settings = load_settings()
    settings['licenseKey'] = license_key
    return save_settings(settings)

def get_license_key():
    settings = load_settings()
    return settings.get('licenseKey')

def monitor_premiere_and_shutdown():
    global should_shutdown

    # Find the process ID of Premiere Pro
    premiere_pro_process = None
    for process in psutil.process_iter(['pid', 'name']):
        if process.info['name'] and 'Adobe Premiere Pro' in process.info['name']:
            premiere_pro_process = process
            break

    if premiere_pro_process:
        # Wait for the Premiere Pro process to terminate
        premiere_pro_process.wait()
        logging.info("Adobe Premiere Pro has been closed. Initiating shutdown.")
        should_shutdown = True
    else:
        logging.info("Adobe Premiere Pro is not running.")

def get_default_download_path(socketio=None):
    try:
        # First try to get path from Premiere Pro project if socketio is available
        if socketio:
            # Create an event to wait for the response
            response_event = threading.Event()
            project_path_response = {'path': None}
            
            def on_project_path_response(data):
                project_path_response['path'] = data.get('path')
                response_event.set()
            
            # Register temporary handler
            socketio.on_event('project_path_response', on_project_path_response)
            
            # Request the path
            socketio.emit('request_project_path')
            
            # Wait for response with timeout
            if response_event.wait(timeout=5):
                project_path = project_path_response['path']
                if project_path:
                    # Create YoutubeToPremiere_download folder next to the project
                    download_path = os.path.join(os.path.dirname(project_path), 'YoutubeToPremiere_download')
                    os.makedirs(download_path, exist_ok=True)
                    logging.info(f"Using project-related download path: {download_path}")
                    return download_path
        
        # If we couldn't get a path from the Premiere project, use fallback paths
        download_folder_name = 'YoutubeToPremiere_download'
        fallback_path = None
        
        # Try to use Documents folder as fallback
        documents_path = os.path.expanduser('~/Documents')
        fallback_path = os.path.join(documents_path, download_folder_name)
            
        # Create directory if it doesn't exist
        try:
            os.makedirs(fallback_path, exist_ok=True)
            logging.info(f"Using fallback download path: {fallback_path}")
            return fallback_path
        except Exception as folder_error:
            logging.error(f"Error creating fallback folder: {folder_error}")
        
        # Last resort - if we can't create the folder in user directory, use temp
        temp_dir = os.environ.get('TEMP' if sys.platform == 'win32' else 'TMPDIR', '/tmp')
        last_resort_path = os.path.join(temp_dir, download_folder_name)
        os.makedirs(last_resort_path, exist_ok=True)
        logging.warning(f"Using temporary directory as fallback: {last_resort_path}")
        return last_resort_path
        
    except Exception as e:
        logging.error(f'Error getting download path: {e}')
        return None

def get_current_project_path():
    try:
        # Get the default Premiere Pro project directory
        if platform.system() == 'Windows':
            project_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Adobe', 'Premiere Pro')
        else:
            project_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Adobe', 'Premiere Pro')
        
        # Find the most recent version folder
        version_folders = [f for f in os.listdir(project_dir) if os.path.isdir(os.path.join(project_dir, f))]
        if not version_folders:
            return None
            
        latest_version = sorted(version_folders)[-1]
        project_dir_path = os.path.join(project_dir, latest_version)
        
        logging.info(f"Project directory path: {project_dir_path}")
        return project_dir_path
    except Exception as e:
        logging.error(f'Error getting project path: {e}', exc_info=True)
        return None

def import_video_to_premiere(video_path):
    """Import video file into the active Premiere Pro project and open it in the source monitor."""
    if not os.path.exists(video_path):
        logging.error(f'File does not exist: {video_path}')
        return False

    try:
        logging.info('Attempting to import video to Premiere...')
        temp_dir = os.path.join(os.environ['TEMP'], 'YoutubetoPremiere')
        os.makedirs(temp_dir, exist_ok=True)
        
        script_path = os.path.join(temp_dir, 'script.jsx')
        result_path = os.path.join(temp_dir, 'result.txt')

        # Remove any existing files
        for file in [script_path, result_path]:
            if os.path.exists(file):
                try:
                    os.remove(file)
                except:
                    pass

        # Prepare the path for ExtendScript
        video_path_escaped = video_path.replace('\\', '\\\\')
        
        # Create the ExtendScript optimized for maximum speed
        script = f"""
        var result = "false";
        try {{
            if (app.project && app.sourceMonitor) {{
                // Ultra-fast approach: import and immediately open
                var projectItem = app.project.importFiles(["{video_path_escaped}"], false, app.project.rootItem, false);
                
                if (projectItem && projectItem.length > 0) {{
                    // Immediate opening - no validation needed
                    app.sourceMonitor.openProjectItem(projectItem[0]);
                    result = "true";
                }} else {{
                    result = "import_failed";
                }}
            }} else if (app.project) {{
                // Fallback: import only
                var projectItem = app.project.importFiles(["{video_path_escaped}"], false, app.project.rootItem, false);
                result = projectItem && projectItem.length > 0 ? "true_no_monitor" : "import_failed";
            }} else {{
                result = "no_project";
            }}
        }} catch(e) {{
            result = "error: " + e.toString();
        }}

        // Write result
        var file = new File("{result_path}".replace(/\\\\/g, '/'));
        file.open('w');
        file.write(result);
        file.close();
        """

        # Write the script
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script)

        # Reduced timeout - faster response
        start_time = time.time()
        while not os.path.exists(result_path):
            if time.time() - start_time > 15:  # Reduced from 30 to 15 seconds
                logging.error("Timeout waiting for import result")
                return False
            time.sleep(0.05)  # Check more frequently - every 50ms instead of 100ms

        # Read the result with retry for partial writes
        result = None
        for attempt in range(3):  # Try up to 3 times
            try:
                with open(result_path, 'r', encoding='utf-8') as f:
                    result = f.read().strip()
                if result:  # If we got a result, break
                    break
            except (FileNotFoundError, PermissionError):
                time.sleep(0.1)  # Wait briefly and retry

        # Clean up immediately
        try:
            os.remove(script_path)
            os.remove(result_path)
        except:
            pass

        if result and result.startswith("true"):
            logging.info('Video imported and opened in source monitor successfully')
            if result == "true_no_monitor":
                logging.warning("Source monitor not available")
            return True
        else:
            logging.error(f'Failed to import video: {result}')
            return False

    except Exception as e:
        logging.error(f'Error during import: {e}', exc_info=True)
        return False

def sanitize_title(title):
    # Keep more characters, only remove problematic ones
    invalid_chars = '<>:"/\\|?*'
    sanitized_title = ''.join(c for c in title if c not in invalid_chars)
    sanitized_title = sanitized_title.strip()
    # Limit length to avoid path length issues
    if len(sanitized_title) > 100:
        sanitized_title = sanitized_title[:100]
    return sanitized_title

def generate_new_filename(base_path, original_name, extension, suffix=""):
    base_filename = f"{original_name}{suffix}.{extension}"
    if not os.path.exists(os.path.join(base_path, base_filename)):
        return base_filename
    
    counter = 1
    new_name = f"{original_name}{suffix}_{counter}.{extension}"
    while os.path.exists(os.path.join(base_path, new_name)):
        counter += 1
        new_name = f"{original_name}{suffix}_{counter}.{extension}"
    return new_name

def play_notification_sound(volume=0.3, sound_type='notification_sound'): 
    pygame.mixer.init()

    # Get the correct base path whether running as exe or script
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    # Define possible sound directories
    sound_dirs = [
        os.path.join(base_path, 'sounds'),
        os.path.join(os.path.dirname(base_path), 'sounds'),
        os.path.join(base_path, 'app', 'sounds'),
        os.path.join(base_path, 'exec', 'sounds'),
        os.path.join(os.path.dirname(base_path), 'app', 'sounds')
    ]
    
    # Find first existing sounds directory
    sounds_dir = None
    for dir_path in sound_dirs:
        if os.path.exists(dir_path):
            sounds_dir = dir_path
            break
    
    if not sounds_dir:
        logging.error(f"No sounds directory found. Searched in: {sound_dirs}")
        return

    # Get all sound files in the sounds directory
    sound_files = [f for f in os.listdir(sounds_dir) 
                  if f.endswith(('.mp3', '.wav'))]
    
    if not sound_files:
        logging.error(f"No sound files found in {sounds_dir}")
        return

    # Try to find the requested sound with either extension
    sound_filename = None
    for ext in ['.mp3', '.wav']:
        if f'{sound_type}{ext}' in sound_files:
            sound_filename = f'{sound_type}{ext}'
            break
    
    # If requested sound doesn't exist, use notification_sound or first available sound
    if not sound_filename:
        # First try notification_sound
        for ext in ['.mp3', '.wav']:
            if f'notification_sound{ext}' in sound_files:
                sound_filename = f'notification_sound{ext}'
                logging.info(f"Using default notification sound: {sound_filename}")
                break
        # If notification_sound not found, use first available sound
        if not sound_filename:
            sound_filename = sound_files[0]
            logging.info(f"Using fallback sound: {sound_filename}")

    notification_sound_path = os.path.join(sounds_dir, sound_filename)
            
    try:
        pygame.mixer.music.load(notification_sound_path)
        pygame.mixer.music.set_volume(volume)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
    except Exception as e:
        logging.error(f"Error playing notification sound: {e}")

def is_premiere_running():
    for process in psutil.process_iter(['pid', 'name']):
        if process.info['name'] and 'Adobe Premiere Pro' in process.info['name']:
            return True
    return False

def find_ffmpeg():
    """Find FFmpeg executable - consistent with init.py approach"""
    
    # First check if FFMPEG_PATH environment variable is set
    env_ffmpeg_path = os.environ.get('FFMPEG_PATH')
    if env_ffmpeg_path and os.path.exists(env_ffmpeg_path):
        logging.info(f"Found FFmpeg via environment variable: {env_ffmpeg_path}")
        return env_ffmpeg_path
    
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    # Try the same paths as init.py
    ffmpeg_paths = [
        os.path.join(base_path, '_internal', 'ffmpeg.exe'),  # PyInstaller _internal
        os.path.join(base_path, 'ffmpeg.exe'),               # Same directory
        os.path.join(base_path, 'exec', 'ffmpeg.exe'),       # exec subdirectory
        os.path.join(os.path.dirname(base_path), 'exec', 'ffmpeg.exe'),  # Parent's exec
        os.path.join(os.path.dirname(base_path), 'ffmpeg.exe')            # Parent directory
    ]
    
    # Add extension root paths if available
    extension_root = os.environ.get('EXTENSION_ROOT')
    if extension_root:
        ffmpeg_paths.extend([
            os.path.join(extension_root, 'exec', '_internal', 'ffmpeg.exe'),
            os.path.join(extension_root, 'exec', 'ffmpeg.exe'),
            os.path.join(extension_root, 'ffmpeg.exe'),
        ])
    
    for path in ffmpeg_paths:
        if os.path.exists(path):
            # Quick validation - check file size (FFmpeg should be several MB)
            try:
                if os.path.getsize(path) > 1000000:  # > 1MB
                    logging.info(f"Found FFmpeg at: {path}")
                    return path
                else:
                    logging.warning(f"Found ffmpeg at {path} but size is suspiciously small")
            except Exception as e:
                logging.warning(f"Error checking FFmpeg size at {path}: {e}")
    
    raise Exception("FFmpeg not found in any of the expected locations")

def save_download_path(download_path):
    """Save the download path to settings"""
    settings = load_settings()
    settings['downloadPath'] = download_path
    return save_settings(settings)

def check_ffmpeg(ffmpeg_path):
    """Check if ffmpeg is available and working."""
    import subprocess
    import platform
    import logging
    import os
    
    logger = logging.getLogger('YoutubetoPremiere')
    
    if not ffmpeg_path:
        logger.error("FFmpeg path is not set")
        return False
    
    try:
        # First make sure the file exists
        if not os.path.exists(ffmpeg_path):
            logger.error(f"FFmpeg executable not found at path: {ffmpeg_path}")
            return False

        # On Windows, use shell=True to avoid handle issues in Premiere environment
        use_shell = platform.system() == 'Windows'
        
        # Run ffmpeg -version with shell=True on Windows
        cmd = [ffmpeg_path, "-version"] if not use_shell else f'"{ffmpeg_path}" -version'
        
        logger.info(f"Running ffmpeg check command: {cmd}")
        result = subprocess.run(
            cmd,
            shell=use_shell, 
            capture_output=True, 
            text=True, 
            check=False
        )
        
        if result.returncode == 0 and "ffmpeg version" in result.stdout:
            logger.info(f"FFmpeg found and working: {ffmpeg_path}")
            return True
        else:
            logger.error(f"FFmpeg check failed. Return code: {result.returncode}")
            logger.error(f"Error output: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"Error checking FFmpeg: {str(e)}")
        # If verification fails but file exists, assume it works
        if os.path.exists(ffmpeg_path) and os.path.getsize(ffmpeg_path) > 1000000:  # File exists and is reasonably sized
            logger.warning(f"FFmpeg verification failed but file exists and appears valid. Assuming it works: {ffmpeg_path}")
            return True
        return False

def get_temp_dir():
    """Get the temporary directory for files."""
    import os
    import tempfile
    
    # First try to use a subdirectory in the same directory as the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check if script directory is writable BEFORE trying to create temp directory
    if os.access(script_dir, os.W_OK):
        temp_dir = os.path.join(script_dir, "temp")
        try:
            # Try to create the directory to test if we can actually write
            os.makedirs(temp_dir, exist_ok=True)
            # Test write access by creating a temporary file
            test_file = os.path.join(temp_dir, 'test_write.tmp')
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
            return temp_dir
        except (OSError, PermissionError):
            # If we can't create or write, fall through to system temp
            pass
    
    # Use system temp directory
    system_temp = tempfile.gettempdir()
    temp_dir = os.path.join(system_temp, "YoutubetoPremiere")
    
    # Create the directory if it doesn't exist
    os.makedirs(temp_dir, exist_ok=True)
    
    return temp_dir

def clear_temp_files(temp_dir=None, max_age_hours=24):
    """Clear temporary files older than the specified age."""
    import os
    import time
    import logging
    
    logger = logging.getLogger('YoutubetoPremiere')
    
    if temp_dir is None:
        temp_dir = get_temp_dir()
    
    if not os.path.exists(temp_dir):
        return
    
    try:
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        count = 0
        for filename in os.listdir(temp_dir):
            file_path = os.path.join(temp_dir, filename)
            
            # Only remove files, not directories
            if os.path.isfile(file_path):
                # Check file age
                file_age = current_time - os.path.getmtime(file_path)
                if file_age > max_age_seconds:
                    try:
                        os.remove(file_path)
                        count += 1
                    except OSError:
                        # Skip files that can't be removed
                        pass
        
        if count > 0:
            logger.info(f"Cleared {count} temporary files from {temp_dir}")
    except Exception as e:
        logger.error(f"Error clearing temporary files: {str(e)}")

def open_sounds_folder():
    """Open the sounds folder in the file explorer."""
    import os
    import sys
    import subprocess
    import logging
    
    logger = logging.getLogger('YoutubetoPremiere')
    
    try:
        # Get the correct base path whether running as exe or script
        if getattr(sys, 'frozen', False):
            base_path = os.path.dirname(sys.executable)
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
        
        # Define possible sound directories
        sound_dirs = [
            os.path.join(base_path, 'sounds'),
            os.path.join(os.path.dirname(base_path), 'sounds'),
            os.path.join(base_path, 'app', 'sounds'),
            os.path.join(base_path, 'exec', 'sounds'),
            os.path.join(os.path.dirname(base_path), 'app', 'sounds')
        ]
        
        # Find first existing sounds directory
        sounds_dir = None
        for dir_path in sound_dirs:
            if os.path.exists(dir_path):
                sounds_dir = dir_path
                break
        
        # If no sounds directory found, create one in the first preferred location
        if not sounds_dir:
            sounds_dir = sound_dirs[0]  # Use first option as default
            os.makedirs(sounds_dir, exist_ok=True)
            logger.info(f"Created sounds directory: {sounds_dir}")
        
        # Open the directory in file explorer
        if platform.system() == 'Windows':
            subprocess.run(['explorer', sounds_dir], check=True)
        elif platform.system() == 'Darwin':  # macOS
            subprocess.run(['open', sounds_dir], check=True)
        else:  # Linux and others
            subprocess.run(['xdg-open', sounds_dir], check=True)
        
        logger.info(f"Opened sounds folder: {sounds_dir}")
        return sounds_dir
        
    except Exception as e:
        logger.error(f"Error opening sounds folder: {str(e)}")
        raise e

def diagnose_windows_networking():
    """Diagnose Windows networking issues that might affect the server"""
    if sys.platform != 'win32':
        return
    
    import subprocess
    import os
    logging.info("=== Windows Network Diagnostics ===")
    
    # Get system directories for Windows commands
    system32_dir = os.path.join(os.environ.get('SYSTEMROOT', 'C:\\Windows'), 'System32')
    netstat_path = os.path.join(system32_dir, 'netstat.exe')
    ping_path = os.path.join(system32_dir, 'ping.exe')
    netsh_path = os.path.join(system32_dir, 'netsh.exe')
    
    try:
        # Check if port 3001 is being used
        if os.path.exists(netstat_path):
            result = subprocess.run([netstat_path, '-an'], capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace')
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                port_3001_lines = [line for line in lines if ':3001' in line]
                if port_3001_lines:
                    logging.info("Port 3001 usage:")
                    for line in port_3001_lines[:5]:  # Limit output
                        logging.info(f"  {line.strip()}")
                else:
                    logging.info("Port 3001 is not currently in use")
        else:
            logging.warning(f"netstat.exe not found at {netstat_path}")
    except Exception as e:
        logging.warning(f"Could not check port usage: {e}")
    
    try:
        # Check Windows Firewall status
        if os.path.exists(netsh_path):
            result = subprocess.run([netsh_path, 'advfirewall', 'show', 'allprofiles', 'state'], 
                                  capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace')
            if result.returncode == 0:
                logging.info("Windows Firewall status:")
                for line in result.stdout.split('\n'):
                    if 'State' in line and line.strip():
                        logging.info(f"  {line.strip()}")
        else:
            logging.warning(f"netsh.exe not found at {netsh_path}")
    except Exception as e:
        logging.warning(f"Could not check Windows Firewall status: {e}")
    
    try:
        # Test localhost connectivity
        if os.path.exists(ping_path):
            result = subprocess.run([ping_path, '-n', '1', 'localhost'], 
                                  capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace')
            if result.returncode == 0:
                logging.info("Localhost ping successful")
            else:
                logging.warning("Localhost ping failed - this may indicate networking issues")
                if result.stderr:
                    logging.warning(f"Ping error: {result.stderr}")
        else:
            logging.warning(f"ping.exe not found at {ping_path}")
    except Exception as e:
        logging.warning(f"Could not test localhost connectivity: {e}")
    
    try:
        # Check for proxy settings
        if os.path.exists(netsh_path):
            result = subprocess.run([netsh_path, 'winhttp', 'show', 'proxy'], 
                                  capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace')
            if result.returncode == 0:
                proxy_info = result.stdout.strip()
                if 'Direct access' in proxy_info or 'Accès direct' in proxy_info:
                    logging.info("No proxy configured")
                else:
                    logging.info(f"Proxy information: {proxy_info[:100]}...")  # Truncate long output
        else:
            logging.warning("Cannot check proxy settings - netsh not available")
    except Exception as e:
        logging.warning(f"Could not check proxy settings: {e}")
    
    logging.info("=== End Windows Network Diagnostics ===")

def create_windows_firewall_rule():
    """Attempt to create a Windows Firewall rule for the application"""
    if sys.platform != 'win32':
        return False
    
    import os
    import subprocess
    
    try:
        # Get the current executable path
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
        else:
            exe_path = sys.executable
        
        # Get system directory for netsh
        system32_dir = os.path.join(os.environ.get('SYSTEMROOT', 'C:\\Windows'), 'System32')
        netsh_path = os.path.join(system32_dir, 'netsh.exe')
        
        if not os.path.exists(netsh_path):
            logging.warning(f"netsh.exe not found at {netsh_path}")
            return False
        
        # Try to add firewall rule for the Python executable
        cmd = [
            netsh_path, 'advfirewall', 'firewall', 'add', 'rule',
            'name=YoutubetoPremiere Server',
            f'program={exe_path}',
            'dir=in',
            'action=allow',
            'protocol=TCP',
            'localport=3001'
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            logging.info("Successfully created Windows Firewall rule for YoutubetoPremiere")
            return True
        else:
            logging.warning(f"Failed to create Windows Firewall rule: {result.stderr}")
            return False
    except Exception as e:
        logging.warning(f"Could not create Windows Firewall rule: {e}")
        return False