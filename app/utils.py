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
        # Use ExtendScript to get project path
        script = """
        if (app.project) {
            app.project.path;
        } else {
            '';
        }
        """
        result = run_extendscript(script)
        if result and result.strip():
            project_dir_path = os.path.dirname(result.strip())
            logging.info(f"Project directory path: {project_dir_path}")
            return project_dir_path
        else:
            logging.warning("No active project found in Premiere Pro")
            return None
    except Exception as e:
        logging.error(f'Error getting project path: {e}', exc_info=True)
        return None

def import_video_to_premiere(video_path):
    """Import video file into the active Premiere Pro project and open it in the source monitor."""
    if not os.path.exists(video_path):
        logging.error(f'File does not exist: {video_path}')
        return

    try:
        logging.info('Attempting to import video to Premiere...')

        # Pre-process path to avoid backslash issues in f-string
        imported_path = video_path.replace('\\', '\\\\')

        # Use ExtendScript to import and open in source monitor
        script = f"""
        var success = false;
        if (app.project) {{
            try {{
                var importedFile = app.project.importFiles(["{imported_path}"], 
                    false, // suppressUI
                    app.project.rootItem, // targetBin
                    false // importAsNumberedStills
                );
                
                if (importedFile && importedFile.length > 0) {{
                    app.sourceMonitor.openProjectItem(importedFile[0]);
                    success = true;
                }}
            }} catch(e) {{
                '$ERROR:' + e.toString();
            }}
        }}
        success;
        """
        result = run_extendscript(script)
        
        if result and not result.startswith('$ERROR:'):
            logging.info('Video imported and opened in source monitor successfully')
        else:
            error_msg = result.replace('$ERROR:', '') if result else 'Unknown error'
            logging.error(f'Failed to import video: {error_msg}')

    except Exception as e:
        logging.error(f'Error during import or opening video in source monitor: {e}', exc_info=True)

def run_extendscript(script):
    try:
        if platform.system() == 'Windows':
            script_path = os.path.join(os.environ['TEMP'], 'temp_script.jsx')
            result_path = os.path.join(os.environ['TEMP'], 'temp_result.txt')
            
            # Check if ExtendScript Toolkit exists
            extendscript_paths = [
                r"C:\Program Files\Adobe\Adobe ExtendScript Toolkit CC\ExtendScript Toolkit.exe",
                r"C:\Program Files (x86)\Adobe\Adobe ExtendScript Toolkit CC\ExtendScript Toolkit.exe"
            ]
            
            extendscript_exe = next((path for path in extendscript_paths if os.path.exists(path)), None)
            
            if not extendscript_exe:
                logging.error("ExtendScript Toolkit not found")
                return None
        else:
            script_path = '/tmp/temp_script.jsx'
            result_path = '/tmp/temp_result.txt'

        # Prepare the result path with proper escaping
        escaped_result_path = result_path.replace('\\', '\\\\')
        
        # Write the script without using f-strings for the backslash parts
        script_content = (
            'try {\n'
            '    var result = (function() {\n'
            f'        {script}\n'
            '    })();\n'
            f'    var f = new File("{escaped_result_path}");\n'
            '    f.open("w");\n'
            '    f.write(result !== undefined ? result.toString() : "");\n'
            '    f.close();\n'
            '} catch(e) {\n'
            f'    var f = new File("{escaped_result_path}");\n'
            '    f.open("w");\n'
            '    f.write("$ERROR:" + e.toString());\n'
            '    f.close();\n'
            '}'
        )

        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_content)

        if platform.system() == 'Windows':
            subprocess.run([extendscript_exe, script_path], capture_output=True, check=True)
        else:
            subprocess.run(['osascript', '-e', 
                f'tell application "Adobe Premiere Pro" to do javascript file "{script_path}"'], 
                capture_output=True, check=True)

        if os.path.exists(result_path):
            with open(result_path, 'r', encoding='utf-8') as f:
                result = f.read().strip()
            return result
        return None

    except Exception as e:
        logging.error(f'Error running ExtendScript: {e}')
        return None
    finally:
        if os.path.exists(script_path):
            try:
                os.remove(script_path)
            except:
                pass
        if os.path.exists(result_path):
            try:
                os.remove(result_path)
            except:
                pass

def sanitize_title(title):
    valid_chars = "-_.() %s%s" % (string.ascii_letters, string.digits)
    sanitized_title = ''.join(c for c in title if c in valid_chars)
    sanitized_title = sanitized_title.strip()
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
    
    return ffmpeg_path
