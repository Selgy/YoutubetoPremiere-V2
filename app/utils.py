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
        'licenseKey': None
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

    logging.info(f'Loaded settings: {settings}')
    return settings

def save_settings(settings):
    settings_path = settings.get('SETTINGS_FILE')
    if settings_path:
        # Create a copy of settings without the SETTINGS_FILE path
        settings_to_save = settings.copy()
        settings_to_save.pop('SETTINGS_FILE', None)
        settings_to_save.pop('ffmpeg_path', None)
        
        with open(settings_path, 'w') as f:
            json.dump(settings_to_save, f, indent=4)
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
                    download_path = os.path.join(os.path.dirname(project_path), 'YoutubeToPremiere_download')
                    os.makedirs(download_path, exist_ok=True)
                    return download_path
        
        # Fallback to Documents path if no project path received
        documents_path = os.path.expanduser('~/Documents')
        fallback_path = os.path.join(documents_path, 'YoutubeToPremiere_download')
        os.makedirs(fallback_path, exist_ok=True)
        return fallback_path
        
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
        
        # Create the ExtendScript with debug alerts
        script = f"""
        var result = "false";
        try {{
            if (app.project) {{
                var importedFile = app.project.importFiles(["{video_path_escaped}"], 
                    false, 
                    app.project.rootItem, 
                    false
                );
                
                if (importedFile && importedFile.length > 0) {{
                    // Try using QE DOM first
                    if (typeof qe !== 'undefined' && qe.project) {{
                        var qeProject = qe.project;
                        var importedItem = null;
                        
                        for (var i = 0; i < qeProject.numItems; i++) {{
                            var item = qeProject.getItemAt(i);
                            if (item && item.filePath === "{video_path_escaped}") {{
                                importedItem = item;
                                break;
                            }}
                        }}
                        
                        if (importedItem) {{
                            importedItem.openInSource();
                            result = "true";
                        }} else {{
                            importedFile[0].openInSource();
                            result = "true";
                        }}
                    }} else {{
                        importedFile[0].openInSource();
                        result = "true";
                    }}
                }}
            }}
        }} catch(e) {{
            result = "Error: " + e.toString();
        }}

        // Write the result to file
        var resultFile = new File("{result_path}".replace(/\\\\/g, '/'));
        resultFile.open('w');
        resultFile.write(result);
        resultFile.close();
        """

        # Write the script
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script)

        # Wait for the result file (max 30 seconds)
        start_time = time.time()
        while not os.path.exists(result_path):
            if time.time() - start_time > 30:
                logging.error("Timeout waiting for import result")
                return False
            time.sleep(0.1)

        # Read the result
        with open(result_path, 'r', encoding='utf-8') as f:
            result = f.read().strip()

        # Clean up
        try:
            os.remove(script_path)
            os.remove(result_path)
        except:
            pass

        if result == "true":
            logging.info('Video imported and opened in source monitor successfully')
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
    """Find FFmpeg executable in the extension's exec directory."""
    if platform.system() == 'Windows':
        ffmpeg_name = 'ffmpeg.exe'
    else:
        ffmpeg_name = 'ffmpeg'

    # Get the extension root directory
    script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    exec_dir = os.path.join(script_dir, 'exec')
    bundled_ffmpeg = os.path.join(exec_dir, ffmpeg_name)
    
    def is_valid_ffmpeg(path):
        try:
            result = subprocess.run([path, '-version'], capture_output=True, text=True)
            return result.returncode == 0 and 'ffmpeg version' in result.stdout.lower()
        except Exception:
            return False

    # Check if FFmpeg exists and is valid
    if os.path.isfile(bundled_ffmpeg) and is_valid_ffmpeg(bundled_ffmpeg):
        logging.info(f"Using FFmpeg from exec directory: {bundled_ffmpeg}")
        return bundled_ffmpeg

    raise FileNotFoundError(
        "FFmpeg not found in the extension's exec directory. "
        "Please ensure the extension is properly installed with FFmpeg included."
    )
