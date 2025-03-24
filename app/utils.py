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
        
        # Create the ExtendScript without debug alerts
        script = f"""
        var result = "false";
        try {{
            if (app.project) {{
                // Helper function to get all nodeIds from the root bin
                function getAllNodeIds(container) {{
                    var ids = [];
                    if (container && container.children && container.children.numItems > 0) {{
                        for (var i = 0; i < container.children.numItems; i++) {{
                            try {{
                                var item = container.children[i];
                                if (item && item.nodeId) {{
                                    ids.push(item.nodeId);
                                }}
                            }} catch (e) {{
                                // Ignore errors
                            }}
                        }}
                    }}
                    return ids;
                }}
                
                // Get root bin
                var rootItem = app.project.rootItem;
                
                // Get IDs before import
                var beforeNodeIds = getAllNodeIds(rootItem);
                
                // Import the file
                var importedFiles = app.project.importFiles(["{video_path_escaped}"], 
                    false, 
                    rootItem, 
                    false
                );
                
                if (importedFiles && importedFiles.length > 0) {{
                    // Wait for project to update
                    $.sleep(2000);
                    
                    // Get IDs after import
                    var afterNodeIds = getAllNodeIds(rootItem);
                    
                    // Find the new items
                    var newItems = [];
                    
                    for (var i = 0; i < rootItem.children.numItems; i++) {{
                        var item = rootItem.children[i];
                        var found = false;
                        
                        // Skip bins
                        if (item.type === 2) {{ // BIN type
                            continue;
                        }}
                        
                        // Check if item's nodeId was in the before list
                        for (var j = 0; j < beforeNodeIds.length; j++) {{
                            if (item.nodeId === beforeNodeIds[j]) {{
                                found = true;
                                break;
                            }}
                        }}
                        
                        // If not found in the before list, it's new
                        if (!found) {{
                            newItems.push(item);
                        }}
                    }}
                    
                    // Choose the item to open
                    var importedItem = null;
                    
                    if (newItems.length > 0) {{
                        importedItem = newItems[0];
                    }} else {{
                        importedItem = importedFiles[0];
                    }}
                    
                    // Try to open in source monitor
                    if (app.sourceMonitor) {{
                        try {{
                            // First close any open clips
                            app.sourceMonitor.closeAllClips();
                        }} catch(e) {{
                            // Ignore errors when closing clips
                        }}
                        
                        // Wait for source monitor to be ready
                        $.sleep(2000);
                        
                        // Open the imported item using the proper API method
                        var openResult = app.sourceMonitor.openProjectItem(importedItem);
                        result = "true";
                    }} else {{
                        // No source monitor, but import successful
                        result = "true_no_monitor";
                    }}
                }} else {{
                    result = "import_failed";
                }}
            }} else {{
                result = "no_project";
            }}
        }} catch(e) {{
            result = "error: " + e.toString();
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

        if result.startswith("true"):
            logging.info('Video imported successfully')
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
    if getattr(sys, 'frozen', False):
        base_path = os.path.dirname(sys.executable)
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    ffmpeg_paths = [
        os.path.join(base_path, 'exec', 'ffmpeg.exe'),
        os.path.join(base_path, 'ffmpeg.exe'),
        os.path.join(os.path.dirname(base_path), 'exec', 'ffmpeg.exe'),
        os.path.join(os.path.dirname(base_path), 'ffmpeg.exe')
    ]
    
    for path in ffmpeg_paths:
        if os.path.exists(path):
            logging.info(f"Found FFmpeg at: {path}")
            return path
            
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
    
    logger = logging.getLogger('YoutubetoPremiere')
    
    if not ffmpeg_path:
        logger.error("FFmpeg path is not set")
        return False
    
    try:
        # Run ffmpeg -version
        result = subprocess.run([ffmpeg_path, "-version"], 
                              capture_output=True, text=True, check=False)
        
        if result.returncode == 0 and "ffmpeg version" in result.stdout:
            logger.info(f"FFmpeg found and working: {ffmpeg_path}")
            return True
        else:
            logger.error(f"FFmpeg check failed. Return code: {result.returncode}")
            logger.error(f"Error output: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"Error checking FFmpeg: {str(e)}")
        return False

def get_temp_dir():
    """Get the temporary directory for files."""
    import os
    import tempfile
    
    # First try to use a subdirectory in the same directory as the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    temp_dir = os.path.join(script_dir, "temp")
    
    # If that's not writable, use system temp directory
    if not os.access(script_dir, os.W_OK):
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
