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

import time

def load_settings():
    default_settings = {
        'resolution': '1080',
        'downloadPath': '',
        'downloadMP3': False,
        'secondsBefore': '15',
        'secondsAfter': '15'
    }

    script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    
    settings_path = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~/.config')), 
                                'YoutubetoPremiere', 'settings.json')
    
    if not os.path.exists(os.path.dirname(settings_path)):
        os.makedirs(os.path.dirname(settings_path))

    if os.path.exists(settings_path):
        with open(settings_path, 'r') as f:
            settings = json.load(f)
    else:
        settings = default_settings
        with open(settings_path, 'w') as f:
            json.dump(settings, f, indent=4)

    settings['SETTINGS_FILE'] = settings_path
    
    # Find or download ffmpeg
    try:
        settings['ffmpeg_path'] = find_ffmpeg()
        # Add ffmpeg directory to PATH
        ffmpeg_dir = os.path.dirname(settings['ffmpeg_path'])
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
        logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")
        logging.info(f"Using ffmpeg from: {settings['ffmpeg_path']}")
    except Exception as e:
        logging.error(f"Error setting up ffmpeg: {e}")
        settings['ffmpeg_path'] = None

    logging.info(f'Loaded settings: {settings}')
    return settings

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

def get_default_download_path():
    project_dir_path = get_current_project_path()
    if project_dir_path:
        default_path = os.path.join(project_dir_path, 'YoutubeToPremiere_download')
        if not os.path.exists(default_path):
            os.makedirs(default_path)
        return default_path
    else:
        logging.error("No active Premiere Pro project found.")
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

def play_notification_sound(volume=0.4):  # Default volume set to 50%
    pygame.mixer.init()

    base_path = sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    notification_sound_path = os.path.join(base_path, 'notification_sound.mp3')

    pygame.mixer.music.load(notification_sound_path)  # Load the notification sound file
    pygame.mixer.music.set_volume(volume)  # Set the volume
    pygame.mixer.music.play()
    while pygame.mixer.music.get_busy():
        pygame.time.Clock().tick(10)

def is_premiere_running():
    for process in psutil.process_iter(['pid', 'name']):
        if process.info['name'] and 'Adobe Premiere Pro' in process.info['name']:
            return True
    return False

def download_ffmpeg(script_dir):
    """Download ffmpeg binary based on platform."""
    # FFmpeg download URLs for different platforms
    if platform.system() == 'Windows':
        ffmpeg_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
        local_zip = os.path.join(script_dir, 'ffmpeg.zip')
        final_path = os.path.join(script_dir, 'ffmpeg.exe')
    elif platform.system() == 'Darwin':
        ffmpeg_url = "https://evermeet.cx/ffmpeg/getrelease/zip"
        local_zip = os.path.join(script_dir, 'ffmpeg.zip')
        final_path = os.path.join(script_dir, 'ffmpeg')
    elif platform.system() == 'Linux':
        ffmpeg_url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
        local_zip = os.path.join(script_dir, 'ffmpeg.tar.xz')
        final_path = os.path.join(script_dir, 'ffmpeg')
    else:
        raise Exception("Unsupported operating system")

    logging.info(f"Downloading FFmpeg from {ffmpeg_url}")
    
    # Download with progress bar
    response = requests.get(ffmpeg_url, stream=True)
    total_size = int(response.headers.get('content-length', 0))
    
    with open(local_zip, 'wb') as file, tqdm(
        desc="Downloading FFmpeg",
        total=total_size,
        unit='iB',
        unit_scale=True,
        unit_divisor=1024,
    ) as pbar:
        for data in response.iter_content(chunk_size=1024):
            size = file.write(data)
            pbar.update(size)

    # Extract FFmpeg
    logging.info("Extracting FFmpeg")
    try:
        if platform.system() == 'Windows':
            with zipfile.ZipFile(local_zip, 'r') as zip_ref:
                ffmpeg_exe = next(name for name in zip_ref.namelist() if 'ffmpeg.exe' in name.lower())
                with zip_ref.open(ffmpeg_exe) as source, open(final_path, 'wb') as target:
                    shutil.copyfileobj(source, target)
        else:
            if local_zip.endswith('.tar.xz'):
                with tarfile.open(local_zip) as tar:
                    ffmpeg_bin = next(name for name in tar.getnames() if name.endswith('ffmpeg'))
                    member = tar.getmember(ffmpeg_bin)
                    member.name = os.path.basename(final_path)
                    tar.extract(member, script_dir)
            else:
                with zipfile.ZipFile(local_zip, 'r') as zip_ref:
                    ffmpeg_bin = next(name for name in zip_ref.namelist() if name.endswith('ffmpeg'))
                    with zip_ref.open(ffmpeg_bin) as source, open(final_path, 'wb') as target:
                        shutil.copyfileobj(source, target)

        if platform.system() != 'Windows':
            os.chmod(final_path, 0o755)

    except Exception as e:
        logging.error(f"Error extracting FFmpeg: {e}")
        if os.path.exists(local_zip):
            os.remove(local_zip)
        raise

    # Clean up
    if os.path.exists(local_zip):
        os.remove(local_zip)
    logging.info("FFmpeg downloaded and extracted successfully")
    
    return final_path

def find_ffmpeg():
    # First try to find ffmpeg in system PATH
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(['where', 'ffmpeg'], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip().split('\n')[0]
        else:
            result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True)
            if result.returncode == 0:
                return result.stdout.strip()
    except Exception as e:
        logging.warning(f"Could not find system ffmpeg: {e}")

    # If ffmpeg not found, check if it exists next to the executable
    script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    
    if platform.system() == 'Windows':
        ffmpeg_path = os.path.join(script_dir, 'ffmpeg.exe')
    else:
        ffmpeg_path = os.path.join(script_dir, 'ffmpeg')

    # If not found locally, download it
    if not os.path.exists(ffmpeg_path):
        logging.info("FFmpeg not found locally. Downloading...")
        try:
            ffmpeg_path = download_ffmpeg(script_dir)
        except Exception as e:
            logging.error(f"Failed to download FFmpeg: {e}")
            raise Exception(f"Failed to download FFmpeg: {e}")

    # Set executable permissions on Unix-like systems
    if platform.system() != 'Windows':
        os.chmod(ffmpeg_path, 0o755)

    # Add ffmpeg directory to PATH
    ffmpeg_dir = os.path.dirname(ffmpeg_path)
    if platform.system() == 'Windows':
        os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ['PATH']
    
    return ffmpeg_path
