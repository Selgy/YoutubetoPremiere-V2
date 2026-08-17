import os
import json
import psutil
import sys
import platform
import logging
import pygame
import subprocess
import shutil
import threading
import time

# Settings cache to avoid repeated file reads
_settings_cache = None
_settings_cache_time = 0

# FFmpeg path cache — resolved once per process lifetime (never changes at runtime)
_ffmpeg_path_cache = None

def rotate_log_files(paths):
    """Move each existing log aside to <path>.1 so it survives a restart.

    The app used to blank its logs on startup, which meant a crash erased the
    very lines explaining it before anyone could read them.
    """
    for path in paths:
        try:
            if os.path.exists(path) and os.path.getsize(path) > 0:
                previous = path + '.1'
                if os.path.exists(previous):
                    os.remove(previous)
                os.replace(path, previous)
        except Exception as e:
            # Never let log housekeeping stop the app from starting
            print(f"Warning: could not rotate {os.path.basename(path)}: {e}")


class SharedFileHandler(logging.FileHandler):
    """File handler that does not hold the log file open.

    A normal FileHandler keeps a write handle for the whole session. On Windows
    that makes the file unreadable for any tool opening it with the default
    share mode (Notepad, most editors, dragging it into a bug report), which is
    why the logs looked empty or stale while the app was running. Opening in
    append mode per record and closing straight after keeps the file readable
    at all times, and leaves nothing buffered if the process dies.

    Volume is a few hundred records per session, so the extra open/close is not
    worth optimising away.
    """

    def __init__(self, filename, encoding=None, max_bytes=5 * 1024 * 1024):
        # delay=True: do not open the file until something is actually logged
        super().__init__(filename, mode='a', encoding=encoding, delay=True)
        self.max_bytes = max_bytes

    def emit(self, record):
        try:
            self._truncate_if_oversized()
            super().emit(record)
        except Exception:
            # A log write must never take the app down. FileHandler.emit lets
            # errors from opening the file (deleted directory, revoked
            # permissions, full disk) escape, so catch them here and use the
            # logging module's own error path.
            self.handleError(record)
        finally:
            # Release the handle so external readers are never locked out
            if self.stream:
                try:
                    self.stream.close()
                except Exception:
                    pass
                finally:
                    self.stream = None

    def _truncate_if_oversized(self):
        """Guard against a runaway log filling the disk."""
        try:
            if self.max_bytes and os.path.exists(self.baseFilename):
                if os.path.getsize(self.baseFilename) > self.max_bytes:
                    if self.stream:
                        self.stream.close()
                        self.stream = None
                    stamp = time.strftime('%Y-%m-%d %H:%M:%S')
                    with open(self.baseFilename, 'w', encoding=self.encoding) as f:
                        f.write(f"[log truncated at {stamp} - exceeded "
                                f"{self.max_bytes // (1024 * 1024)} MB]\n")
        except Exception:
            pass


# --- Live "active project" tracking ---------------------------------------
# The Premiere panel reports its CURRENTLY active project path via the
# 'project_path_response' socket event. routes.py feeds every such response
# into update_current_project_path() so a download can always ask for the
# project that is active *right now* instead of relying on a value cached at
# connect time (which pointed at whatever project was open when the socket
# first connected — the source of the "video lands in the last project" bug).
_current_project_path = {'path': None}
_project_path_event = threading.Event()


def normalize_project_path(path):
    """Normalize a project path coming from ExtendScript.

    The panel sends File(...).fsName, which is already a native path on both
    Windows and macOS. This is a safety net for any value that still arrives
    URI-encoded (app.project.path returns e.g. /Users/me/My%20Project on Mac):
    only decode when doing so actually resolves to something on disk, so a
    literal '%' in a real folder name is left alone.
    """
    if not path or '%' not in path:
        return path
    try:
        from urllib.parse import unquote
        decoded = unquote(path)
        if decoded != path and os.path.exists(decoded) and not os.path.exists(path):
            logging.info(f"Decoded URI-encoded project path: {path} -> {decoded}")
            return decoded
    except Exception as e:
        logging.debug(f"Could not normalize project path {path}: {e}")
    return path


def update_current_project_path(path):
    """Record the active project path reported by the Premiere panel."""
    if path:
        _current_project_path['path'] = normalize_project_path(path)
    # Wake any download waiting on a live query, even on a null/empty answer.
    _project_path_event.set()


def query_live_project_path(socketio, timeout=5):
    """Ask the Premiere panel for the path of the CURRENTLY active project.

    Returns the raw .prproj path, or None if no panel answered in time.
    """
    if not socketio:
        return None
    try:
        _project_path_event.clear()
        socketio.emit('request_project_path')
        if _project_path_event.wait(timeout=timeout):
            return _current_project_path.get('path')
    except Exception as e:
        logging.warning(f"Live project-path query failed: {e}")
    return None


# Allowed YouTube domains for URL validation
YOUTUBE_DOMAINS = (
    'youtube.com',
    'youtu.be',
    'www.youtube.com',
    'm.youtube.com',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com',
)


def validate_youtube_url(url):
    """Validate that the URL is from a YouTube domain.

    Uses proper URL parsing (not a suffix match) so spoofed domains like
    'evil-youtube.com' or 'notyoutube.com' are rejected.
    """
    if not url:
        return False

    try:
        from urllib.parse import urlparse
        netloc = urlparse(url).netloc.lower()
        # Strip any userinfo (user:pass@) and port
        if '@' in netloc:
            netloc = netloc.split('@', 1)[1]
        domain = netloc.split(':', 1)[0]
        # Exact match OR a proper subdomain (leading dot) — NOT a suffix match,
        # which would wrongly accept 'evil-youtube.com' or 'notyoutube.com'.
        return any(domain == yt or domain.endswith('.' + yt) for yt in YOUTUBE_DOMAINS)
    except Exception:
        pass

    return False


def load_settings():
    global _settings_cache, _settings_cache_time
    
    # Check cache first - avoid repeated file reads
    now = time.time()
    if _settings_cache and (now - _settings_cache_time) < 5:  # 5 second cache
        logging.debug("Settings served from cache")
        return _settings_cache.copy()
    
    # Cache miss - load from disk
    logging.debug("Settings cache miss - loading from disk")
    
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
    
    # Determine settings path based on platform
    # Windows: Always use APPDATA (C:\Users\<user>\AppData\Roaming\YoutubetoPremiere)
    # macOS: Use ~/Library/Application Support/YoutubetoPremiere
    # Linux: Use ~/.config/YoutubetoPremiere
    if sys.platform == 'win32':
        # Force Windows to use APPDATA
        base_path = os.environ.get('APPDATA')
        if not base_path:
            # Fallback if APPDATA is not set (very rare)
            base_path = os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming')
        settings_dir = os.path.join(base_path, 'YoutubetoPremiere')
    elif sys.platform == 'darwin':
        # macOS standard location
        settings_dir = os.path.join(os.path.expanduser('~/Library/Application Support'), 'YoutubetoPremiere')
    else:
        # Linux/Unix
        settings_dir = os.path.join(os.path.expanduser('~/.config'), 'YoutubetoPremiere')
    
    settings_path = os.path.join(settings_dir, 'settings.json')
    
    # Create directory if it doesn't exist
    if not os.path.exists(settings_dir):
        os.makedirs(settings_dir)
    
    # Migration: Check for old settings file in wrong location (Windows only)
    if sys.platform == 'win32':
        old_settings_path = os.path.join(os.path.expanduser('~/.config'), 'YoutubetoPremiere', 'settings.json')
        should_migrate = False
        
        # Migrate if old file exists and either:
        # 1. New file doesn't exist yet, OR
        # 2. New file exists but has no license key (empty migration)
        if os.path.exists(old_settings_path):
            if not os.path.exists(settings_path):
                should_migrate = True
            else:
                # Check if current settings has no license
                try:
                    with open(settings_path, 'r') as f:
                        current_settings = json.load(f)
                        if not current_settings.get('licenseKey'):
                            # Check if old settings has a license
                            with open(old_settings_path, 'r') as old_f:
                                old_settings = json.load(old_f)
                                if old_settings.get('licenseKey'):
                                    should_migrate = True
                                    logging.info("Found license in old settings, will migrate")
                except Exception as e:
                    logging.debug(f"Could not check settings for migration: {e}")
            
            if should_migrate:
                try:
                    import shutil
                    shutil.copy2(old_settings_path, settings_path)
                    logging.info(f"Migrated settings from {old_settings_path} to {settings_path}")
                except Exception as e:
                    logging.warning(f"Could not migrate old settings: {e}")

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

    # One-time migration: older versions wrote the auto-generated
    # 'YoutubeToPremiere_download' folder into downloadPath on every connect.
    # Such a value now reads as an explicit user choice and would pin every
    # download to a long-closed project. Clear it once so the setting goes back
    # to meaning "follow the active project". Guarded by a flag so a user who
    # deliberately picks a folder with that name keeps it.
    if not settings.get('autoDownloadPathCleared'):
        stale = (settings.get('downloadPath', '') or '').strip()
        if stale.replace('\\', '/').rstrip('/').endswith('YoutubeToPremiere_download'):
            logging.info(f"Migration: clearing auto-generated downloadPath ({stale}); "
                         "downloads will follow the active project again")
            settings['downloadPath'] = ''
        settings['autoDownloadPathCleared'] = True
        try:
            to_save = {k: v for k, v in settings.items()
                       if k not in ('SETTINGS_FILE', 'ffmpeg_path')}
            with open(settings_path, 'w') as f:
                json.dump(to_save, f, indent=4)
        except Exception as e:
            logging.warning(f"Could not persist downloadPath migration: {e}")

    # Update cache
    _settings_cache = settings.copy()
    _settings_cache_time = now
    
    # Set up FFmpeg — resolve path only once per process (expensive PATH scan)
    global _ffmpeg_path_cache
    try:
        if _ffmpeg_path_cache is None:
            from app_init import find_ffmpeg as init_find_ffmpeg
            _ffmpeg_path_cache = init_find_ffmpeg()
        settings['ffmpeg_path'] = _ffmpeg_path_cache
        if settings['ffmpeg_path']:
            # Add ffmpeg directory to PATH - only if not already present
            ffmpeg_dir = os.path.dirname(settings['ffmpeg_path'])
            current_path = os.environ.get("PATH", "")
            if ffmpeg_dir not in current_path.split(os.pathsep):
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path
                logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")
            logging.info(f"Using ffmpeg from: {settings['ffmpeg_path']}")
        else:
            raise Exception("FFmpeg not found in any of the expected locations")
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
    global _settings_cache, _settings_cache_time
    settings_path = settings.get('SETTINGS_FILE')
    if settings_path:
        # Load existing settings first
        existing_settings = {}
        if os.path.exists(settings_path):
            try:
                with open(settings_path, 'r') as f:
                    existing_settings = json.load(f)
            except Exception:
                pass

        # Create a copy of settings without the internal fields
        settings_to_save = settings.copy()
        settings_to_save.pop('SETTINGS_FILE', None)
        settings_to_save.pop('ffmpeg_path', None)

        # Update existing settings with new values
        existing_settings.update(settings_to_save)

        with open(settings_path, 'w') as f:
            json.dump(existing_settings, f, indent=4)

        # Invalidate cache so the next load_settings() picks up the new values immediately
        _settings_cache = None
        _settings_cache_time = 0
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
        download_folder_name = 'YoutubeToPremiere_download'
        user_path = (load_settings().get('downloadPath', '') or '').strip()

        # Two modes, exactly as the panel advertises:
        #   settings['downloadPath'] non-empty -> the user picked that folder, use it
        #   settings['downloadPath'] empty     -> follow the ACTIVE project
        # Nothing ever writes the auto folder back into settings, so an empty
        # value stays empty and downloads keep following the current project.
        if user_path:
            try:
                os.makedirs(user_path, exist_ok=True)
                logging.info(f"Using custom download path: {user_path}")
                return user_path
            except OSError as e:
                # Unwritable/unmounted custom folder (external drive, network
                # share, macOS permission prompt declined) — fall through.
                logging.warning(f"Custom download path unusable ({user_path}): {e}")

        # Auto mode: ask the panel which project is active RIGHT NOW.
        live_project_path = query_live_project_path(socketio, timeout=5)
        if live_project_path:
            download_path = os.path.join(os.path.dirname(live_project_path), download_folder_name)
            try:
                os.makedirs(download_path, exist_ok=True)
                logging.info(f"Using current project's download path: {download_path}")
                return download_path
            except OSError as e:
                # Project sitting on a read-only volume, or macOS TCC blocking
                # writes (Desktop/Documents/removable) — fall back below.
                logging.warning(f"Cannot create download folder next to project "
                                f"({download_path}): {e}")

        # No panel answer, or the project folder is not writable: use fallbacks
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

def play_notification_sound(volume=0.3, sound_type='notification_sound'): 
    pygame.mixer.init()

    # Get the correct base path whether running as exe or script
    if getattr(sys, 'frozen', False):
        # For PyInstaller, use _MEIPASS for bundled resources and executable directory for external resources
        bundle_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
        exec_path = os.path.dirname(sys.executable)
    else:
        bundle_path = os.path.dirname(os.path.abspath(__file__))
        exec_path = bundle_path
    
    # Define possible sound directories (prioritize user sounds over bundled ones)
    user_docs = os.path.expanduser('~/Documents')
    user_sounds_dir = os.path.join(user_docs, 'YoutubetoPremiere', 'sounds')
    
    sound_dirs = [
        user_sounds_dir,                                      # user Documents directory (highest priority)
        os.path.join(exec_path, '_internal', 'sounds'),       # PyInstaller _internal directory (macOS)
        os.path.join(exec_path, 'sounds'),                    # next to executable
        os.path.join(exec_path, 'exec', 'sounds'),            # in exec subdirectory  
        os.path.join(bundle_path, 'sounds'),                  # bundled sounds
        os.path.join(bundle_path, '_internal', 'sounds'),     # bundled _internal sounds
        os.path.join(os.path.dirname(exec_path), 'sounds'),   # parent directory
        os.path.join(exec_path, 'app', 'sounds'),             # app subdirectory
        os.path.join(os.path.dirname(exec_path), 'app', 'sounds')  # parent app directory
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

def save_download_path(download_path):
    """Save the download path to settings"""
    settings = load_settings()
    settings['downloadPath'] = download_path
    return save_settings(settings)

def get_temp_dir():
    """Get the temporary directory for files."""
    import os
    import tempfile
    import sys
    
    # For PyInstaller executables, always use system temp directory
    if getattr(sys, 'frozen', False):
        system_temp = tempfile.gettempdir()
        temp_dir = os.path.join(system_temp, "YoutubetoPremiere")
    else:
        # For development, try to use a subdirectory in the same directory as the script
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
        
        # OPTIMIZATION: Use os.scandir() instead of os.listdir() for better performance
        # os.scandir() returns DirEntry objects which cache file stat info
        count = 0
        try:
            with os.scandir(temp_dir) as entries:
                for entry in entries:
                    # Only process files, not directories (cached by DirEntry)
                    if entry.is_file(follow_symlinks=False):
                        # Check file age using cached stat info
                        file_age = current_time - entry.stat(follow_symlinks=False).st_mtime
                        if file_age > max_age_seconds:
                            try:
                                os.remove(entry.path)
                                count += 1
                            except OSError:
                                # Skip files that can't be removed
                                pass
        except Exception as scan_error:
            # Fallback to os.listdir if scandir fails
            logger.warning(f"os.scandir failed, falling back to os.listdir: {scan_error}")
            for filename in os.listdir(temp_dir):
                file_path = os.path.join(temp_dir, filename)
                if os.path.isfile(file_path):
                    file_age = current_time - os.path.getmtime(file_path)
                    if file_age > max_age_seconds:
                        try:
                            os.remove(file_path)
                            count += 1
                        except OSError:
                            pass
        
        if count > 0:
            logger.info(f"Cleared {count} temporary files from {temp_dir}")
    except Exception as e:
        logger.error(f"Error clearing temporary files: {str(e)}")

def open_sounds_folder():
    """Open the sounds folder directly in the file explorer (_internal/sounds)."""
    import os
    import sys
    import subprocess
    import logging
    import platform
    
    logger = logging.getLogger('YoutubetoPremiere')
    
    try:
        logging.info("Opening sounds folder...")
        
        # Find the _internal/sounds directory
        if getattr(sys, 'frozen', False):
            exec_path = os.path.dirname(sys.executable)
            bundle_path = getattr(sys, '_MEIPASS', exec_path)
        else:
            exec_path = os.path.dirname(os.path.abspath(__file__))
            bundle_path = exec_path

        # Look for sounds directory in the bundle/internal directory
        sounds_dirs = [
            os.path.join(exec_path, '_internal', 'sounds'),  # exec/_internal/sounds (highest priority on macOS)
            os.path.join(bundle_path, '_internal', 'sounds'), # bundle/_internal/sounds
            os.path.join(bundle_path, 'sounds'),  # _MEIPASS/sounds
            os.path.join(exec_path, 'sounds'),  # exec/sounds
        ]
        
        sounds_dir = None
        for dir_path in sounds_dirs:
            if os.path.exists(dir_path):
                sounds_dir = dir_path
                logger.info(f"Found sounds directory: {sounds_dir}")
                break
        
        if not sounds_dir:
            logger.error("No sounds directory found")
            raise Exception("Sounds directory not found")
        
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
