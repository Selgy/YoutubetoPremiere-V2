import os
import subprocess
import logging
import yt_dlp  # Import yt_dlp directly
import re
from flask import jsonify
import sys
import platform
import time
import requests
import hashlib

# FFmpeg verification cache
_ffmpeg_verified = False
_ffmpeg_path_cached = None
_ffmpeg_cache_time = 0
_ffmpeg_cache_ttl = 300  # Cache for 5 minutes

def clean_environment_path():
    """Clean up the PATH environment variable to avoid conflicts"""
    current_path = os.environ.get("PATH", "")
    path_dirs = current_path.split(os.pathsep)
    
    # Remove duplicates while preserving order
    seen = set()
    cleaned_dirs = []
    for dir_path in path_dirs:
        if dir_path and dir_path not in seen:
            seen.add(dir_path)
            cleaned_dirs.append(dir_path)
    
    # Set the cleaned PATH
    cleaned_path = os.pathsep.join(cleaned_dirs)
    os.environ["PATH"] = cleaned_path
    
    logging.info(f"Cleaned PATH: removed {len(path_dirs) - len(cleaned_dirs)} duplicate entries")
    logging.debug(f"PATH length: {len(current_path)} -> {len(cleaned_path)} characters")
    
    return cleaned_path
from utils import (
    is_premiere_running,
    import_video_to_premiere,
    sanitize_title,
    generate_new_filename,
    play_notification_sound,
    get_default_download_path,
    get_license_key
)
import traceback
import glob
import json
import tempfile
import shutil
# Removed incorrect import of download_range_func
import urllib.parse as urlparse

# Import psutil only on Windows for process management (optional dependency)
try:
    if sys.platform == 'win32':
        import psutil
        PSUTIL_AVAILABLE = True
    else:
        PSUTIL_AVAILABLE = False
except ImportError:
    PSUTIL_AVAILABLE = False
    logging.warning("psutil not available - ffmpeg process cleanup disabled")

# Global variable to store emit_to_client_type function
_emit_to_client_type = None

def set_emit_function(emit_function):
    """Set the emit_to_client_type function for targeted client emissions"""
    global _emit_to_client_type
    _emit_to_client_type = emit_function

def emit_targeted(event, data, client_type=None, socketio=None):
    """Emit event to specific client type if available, otherwise broadcast"""
    if _emit_to_client_type and client_type:
        _emit_to_client_type(event, data, client_type)
    elif socketio:
        socketio.emit(event, data)
    else:
        logging.warning(f"Could not emit event {event}: no emission method available")

def get_subprocess_creation_flags():
    """Get Windows-specific creation flags to hide console windows"""
    if sys.platform == 'win32':
        # On Windows, use these flags to hide the console window
        import subprocess
        return subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
    return 0

def run_hidden_subprocess(cmd, **kwargs):
    """Run subprocess with hidden console window on Windows"""
    if sys.platform == 'win32':
        # Add Windows-specific flags to hide console window
        creation_flags = get_subprocess_creation_flags()
        kwargs['creationflags'] = creation_flags
        kwargs['startupinfo'] = subprocess.STARTUPINFO()
        kwargs['startupinfo'].dwFlags |= subprocess.STARTF_USESHOWWINDOW
        kwargs['startupinfo'].wShowWindow = subprocess.SW_HIDE
    
    return subprocess.run(cmd, **kwargs)

def cleanup_ffmpeg_processes():
    """Clean up zombie or stuck ffmpeg processes to prevent resource exhaustion (Windows only)"""
    # Only run on Windows where the issue occurs
    if sys.platform != 'win32' or not PSUTIL_AVAILABLE:
        return 0
    
    try:
        killed_count = 0
        ffmpeg_exe_name = 'ffmpeg.exe'
        
        # OPTIMIZATION: Use process name filter to avoid iterating all processes
        # This is MUCH faster than iterating all processes
        try:
            # Get all processes with name matching ffmpeg (much faster)
            processes = [p for p in psutil.process_iter(['pid', 'name', 'create_time']) 
                        if p.info['name'] and ffmpeg_exe_name.lower() in p.info['name'].lower()]
            
            for proc_info in processes:
                try:
                    proc = psutil.Process(proc_info['pid'])
                    # Kill processes running for more than 10 minutes (likely stuck)
                    process_age = time.time() - proc_info['create_time']
                    if process_age > 600:  # 10 minutes
                        logging.warning(f"[Windows] Killing stuck ffmpeg process (PID {proc_info['pid']}, age: {process_age:.0f}s)")
                        proc.kill()
                        killed_count += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue
        except Exception as filter_error:
            # Fallback to old method if filtering fails
            logging.debug(f"Process filtering failed, using fallback: {filter_error}")
            for proc in psutil.process_iter(['pid', 'name', 'create_time']):
                try:
                    if proc.info['name'] and ffmpeg_exe_name.lower() in proc.info['name'].lower():
                        process_age = time.time() - proc.info['create_time']
                        if process_age > 600:
                            proc.kill()
                            killed_count += 1
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue
        
        if killed_count > 0:
            logging.info(f"[Windows] Cleaned up {killed_count} stuck ffmpeg process(es)")
        
        return killed_count
    except Exception as e:
        logging.warning(f"[Windows] Error cleaning up ffmpeg processes: {e}")
        return 0

def cleanup_temporary_cookies():
    """Clean up old temporary cookies files to prevent accumulation (Windows only)"""
    # Only run on Windows where the issue occurs
    if sys.platform != 'win32':
        return 0
    
    try:
        cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
        if not os.path.exists(cookies_dir):
            return 0
        
        cleaned_count = 0
        current_time = time.time()
        
        # Remove cookies files older than 1 hour
        for filename in os.listdir(cookies_dir):
            if filename.startswith('youtube_cookies_') and filename.endswith('.txt'):
                filepath = os.path.join(cookies_dir, filename)
                try:
                    # Check file age
                    file_age = current_time - os.path.getmtime(filepath)
                    if file_age > 3600:  # 1 hour
                        os.remove(filepath)
                        cleaned_count += 1
                except Exception as e:
                    logging.debug(f"Could not remove old cookies file {filename}: {e}")
        
        if cleaned_count > 0:
            logging.info(f"[Windows] Cleaned up {cleaned_count} old temporary cookies file(s)")
        
        return cleaned_count
    except Exception as e:
        logging.warning(f"[Windows] Error cleaning up temporary cookies: {e}")
        return 0

def get_ffmpeg_postprocessor_args():
    """Get FFmpeg arguments that help hide console windows"""
    args = ['-y']  # Overwrite output files
    
    if sys.platform == 'win32':
        # On Windows, add flags to minimize console interaction
        args.extend([
            '-nostdin',      # Don't read from stdin
            '-hide_banner',  # Hide copyright notice
            '-loglevel', 'error'  # Only show errors
        ])
    
    return args

def verify_authentication_cookies(cookies_list):
    """Verify if the cookies contain necessary authentication data for YouTube"""
    if not cookies_list:
        return False, "No cookies provided"
    
    # Check for essential authentication cookies
    auth_cookies = {
        'LOGIN_INFO': False,
        'SAPISID': False,
        'APISID': False,
        '__Secure-3PAPISID': False,
        'SID': False
    }
    
    for cookie in cookies_list:
        name = cookie.get('name', '')
        if name in auth_cookies:
            auth_cookies[name] = True
    
    # Check authentication level
    has_login_info = auth_cookies['LOGIN_INFO']
    has_sapisid = auth_cookies['SAPISID'] or auth_cookies['__Secure-3PAPISID']
    has_sid = auth_cookies['SID']
    
    if has_login_info and has_sapisid:
        return True, "Full authentication detected"
    elif has_sapisid or has_sid:
        return True, "Partial authentication detected"
    else:
        return False, "No authentication cookies found"

# Cookies file cache to avoid repeated file creation
_cookies_cache_file = None
_cookies_cache_hash = None

def create_cookies_file(cookies_list):
    """Create a temporary cookies file from cookies list"""
    global _cookies_cache_file, _cookies_cache_hash
    
    if not cookies_list:
        logging.warning("No cookies provided to create_cookies_file")
        return None
    
    # Calculate hash of cookies to check if we can reuse existing file
    cookies_str = str(sorted((c.get('name', ''), c.get('value', '')) for c in cookies_list))
    current_hash = hashlib.md5(cookies_str.encode()).hexdigest()
    
    # Check cache first - reuse file if cookies haven't changed
    if (_cookies_cache_file and _cookies_cache_hash == current_hash and 
        os.path.exists(_cookies_cache_file)):
        logging.debug(f"Reusing cached cookies file: {_cookies_cache_file}")
        return _cookies_cache_file
    
    # Cache miss - create new file
    logging.debug("Cookies cache miss - creating new cookies file")
        
    # Verify authentication before creating file
    is_authenticated, auth_status = verify_authentication_cookies(cookies_list)
    logging.info(f"Cookie authentication status: {auth_status}")
    
    if not is_authenticated:
        logging.warning("Warning: No valid authentication cookies found. Downloads may fail for age-restricted content.")
    
    try:
        # Create temp directory
        cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
        os.makedirs(cookies_dir, exist_ok=True)
        
        # Create cookies file with timestamp to avoid conflicts
        import time
        timestamp = int(time.time())
        cookies_file = os.path.join(cookies_dir, f'youtube_cookies_{timestamp}.txt')
        
        logging.info(f"Creating cookies file at: {cookies_file}")
        
        with open(cookies_file, 'w', encoding='utf-8') as f:
            f.write("# Netscape HTTP Cookie File\n")
            f.write("# Generated by YoutubetoPremiere Extension\n")
            f.write(f"# Created: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
            
            written_cookies = 0
            auth_cookies_written = 0
            
            # Prioritize authentication cookies first
            auth_cookie_names = [
                'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID', 
                'SAPISID', 'APISID', 'SID', 'HSID', 'SSID', 'SIDCC'
            ]
            
            # Write authentication cookies first
            for cookie in cookies_list:
                name = cookie.get('name', '')
                if name in auth_cookie_names:
                    if write_cookie_to_file(f, cookie, written_cookies):
                        written_cookies += 1
                        auth_cookies_written += 1
            
            # Then write other cookies
            for cookie in cookies_list:
                name = cookie.get('name', '')
                if name not in auth_cookie_names:
                    if write_cookie_to_file(f, cookie, written_cookies):
                        written_cookies += 1
        
        logging.info(f"Created cookies file with {written_cookies} total cookies ({auth_cookies_written} authentication cookies): {cookies_file}")
        
        # Log file size to verify it was created properly
        file_size = os.path.getsize(cookies_file)
        logging.info(f"Cookies file size: {file_size} bytes")
        
        # Validate the file was created properly
        if validate_cookies_file(cookies_file):
            # Update cache
            _cookies_cache_file = cookies_file
            _cookies_cache_hash = current_hash
            logging.debug(f"Updated cookies cache: {cookies_file}")
            return cookies_file
        else:
            return None
        
    except Exception as e:
        logging.error(f"Error creating cookies file: {e}")
        return None

def write_cookie_to_file(file_handle, cookie, index):
    """Write a single cookie to the file in Netscape format"""
    try:
        domain = cookie.get('domain', '.youtube.com')
        name = cookie.get('name', '')
        value = cookie.get('value', '')
        path = cookie.get('path', '/')
        expires = str(cookie.get('expirationDate', '0'))
        secure = 'TRUE' if cookie.get('secure', False) else 'FALSE'
        
        # Skip invalid cookies
        if not name or not value:
            logging.debug(f"Skipping invalid cookie {index}: name='{name}', value='{value}'")
            return False
        
        # Clean and validate cookie data for Netscape format
        name = str(name).replace('\t', '').replace('\n', '').replace('\r', '').strip()
        value = str(value).replace('\t', '').replace('\n', '').replace('\r', '').strip()
        domain = str(domain).replace('\t', '').replace('\n', '').replace('\r', '').strip()
        path = str(path).replace('\t', '').replace('\n', '').replace('\r', '').strip()
        
        # Skip cookies with problematic values or overly long values that might cause parsing issues
        if not name or not value or len(value) > 8192:
            logging.debug(f"Skipping cookie with problematic format {index}: name='{name[:20]}...', value='{value[:20]}...'")
            return False
            
        # Additional validation: ensure no tab characters remain and handle special characters
        if '\t' in name or '\t' in value or '\t' in domain or '\t' in path:
            logging.debug(f"Skipping cookie with tab characters: {name}")
            return False
            
        # Validate domain format
        if not domain or domain.count('.') < 1:
            logging.debug(f"Skipping cookie with invalid domain: {domain}")
            return False
        
        # Skip cookies with purely numeric values that are excessively long (likely session identifiers)
        if name in ['user_id', 'session_id', 'gid'] and value.isdigit() and len(value) > 20:
            logging.debug(f"Skipping potentially problematic numeric cookie: {name} with length {len(value)}")
            return False
        
        # Filter out known problematic cookies that aren't needed for YouTube auth
        problematic_cookies = [
            'GMAIL_AT', 'COMPASS', '__utma', '__utmb', '__utmc', '__utmz', 'IDE', 'DV', 
            'WML', 'GX', 'SMSV', 'ACCOUNT_CHOOSER', 'UULE', '__Host-GMAIL_SCH_GMN',
            '__Host-GMAIL_SCH_GMS', '__Host-GMAIL_SCH_GML', '__Host-GMAIL_SCH',
            '__Host-GAPS', '__Host-1PLSID', '__Host-3PLSID', '__Secure-DIVERSION_ID',
            'LSOLH', '__Secure-ENID', 'OTZ', 'LSID', 'user_id', 'GEM'
        ]
        
        # Filter out __Host-* cookies as they often have problematic formats
        if name.startswith('__Host-') or name in problematic_cookies:
            logging.debug(f"Skipping problematic cookie: {name}")
            return False
        
        # Only keep cookies from core YouTube/Google domains
        allowed_domains = ['.youtube.com', 'www.youtube.com', 'youtube.com', 'm.youtube.com', '.google.com', 'accounts.google.com']
        if domain not in allowed_domains:
            logging.debug(f"Skipping cookie from non-essential domain: {name} from {domain}")
            return False
        
        # Ensure expirationDate is properly formatted
        try:
            expires_float = float(expires) if expires and expires != '0' else 0
            expires = str(int(expires_float)) if expires_float > 0 else '0'
        except (ValueError, TypeError):
            expires = '0'
        
        # Write in Netscape format: domain flag path secure expiration name value
        # The domain flag should be TRUE only if domain starts with '.' (subdomain inclusion)
        domain_flag = 'TRUE' if domain.startswith('.') else 'FALSE'
        cookie_line = f"{domain}\t{domain_flag}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n"
        file_handle.write(cookie_line)
        
        # Log important authentication cookies
        if name in ['SAPISID', 'APISID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID']:
            logging.info(f"Authentication cookie: {name} for domain {domain}")
        
        return True
        
    except Exception as e:
        logging.error(f"Error writing cookie {index}: {e}")
        return False

def validate_cookies_file(cookies_file):
    """Validate that the cookies file was created properly"""
    try:
        with open(cookies_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        valid_lines = 0
        for i, line in enumerate(lines):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Check if line has correct number of tab-separated fields
            parts = line.split('\t')
            if len(parts) == 7:
                valid_lines += 1
            else:
                logging.warning(f"Invalid Netscape format on line {i+1}: {len(parts)} fields instead of 7")
        
        if valid_lines == 0:
            logging.error("No valid cookies found in generated file")
            return False
        
        logging.info(f"Validated {valid_lines} cookie lines in Netscape format")
        return True
        
    except Exception as e:
        logging.error(f"Error validating cookies file: {e}")
        return False

def get_youtube_cookies_file():
    """Get the path to the YouTube cookies file if it exists"""
    try:
        cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
        cookies_file = os.path.join(cookies_dir, 'youtube_cookies.txt')
        
        if os.path.exists(cookies_file) and os.path.getsize(cookies_file) > 0:
            logging.info(f"Found YouTube cookies file: {cookies_file}")
            return cookies_file
        else:
            logging.info("No YouTube cookies file found")
            return None
    except Exception as e:
        logging.error(f"Error checking for YouTube cookies file: {e}")
        return None

def try_extract_cookies_from_browser():
    """Try to extract cookies from browser using yt-dlp's built-in functionality"""
    try:
        cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
        os.makedirs(cookies_dir, exist_ok=True)
        
        browser_cookies_file = os.path.join(cookies_dir, 'youtube_browser_cookies.txt')
        
        # Try to extract cookies from Chrome first, then Edge, then Firefox
        browsers = ['chrome', 'edge', 'firefox']
        
        for browser in browsers:
            try:
                logging.info(f"Attempting to extract YouTube cookies from {browser}")
                
                # Use yt-dlp to extract cookies from browser
                ydl_opts = {
                    'cookiesfrombrowser': (browser, None, None, None),
                    'extract_flat': True,
                    'quiet': True,
                    'writesubtitles': False,
                    'writeautomaticsub': False,
                    'writedescription': False,
                    'writeinfojson': False,
                    'writethumbnail': False,
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    # Test with a simple YouTube URL
                    info = ydl.extract_info('https://www.youtube.com/', download=False)
                    if info:
                        logging.info(f"Successfully extracted cookies from {browser}")
                        return (browser, None, None, None)
                        
            except Exception as e:
                logging.debug(f"Failed to extract cookies from {browser}: {e}")
                continue
        
        logging.warning("Could not extract cookies from any browser")
        return None
        
    except Exception as e:
        logging.error(f"Error in try_extract_cookies_from_browser: {e}")
        return None

def get_ffmpeg_path():
    """Get the path to ffmpeg executable"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    working_dir = os.getcwd()
    
    # If running from CEP extension, prioritize exec directory
    possible_locations = []
    
    # 1. First priority: current working directory (for CEP)
    if working_dir.endswith('exec'):
        # We're already in the exec directory
        possible_locations.append(working_dir)
    else:
        # Check if we can find the exec directory relative to working dir
        exec_from_working = os.path.join(working_dir, 'exec')
        if os.path.exists(exec_from_working):
            possible_locations.append(exec_from_working)
    
    # 2. Try to find CEP extension directory pattern
    extension_patterns = [
        # Standard CEP extension paths
        os.path.join(os.path.expanduser('~'), 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions'),
        '/Library/Application Support/Adobe/CEP/extensions',  # macOS
        '~/Library/Application Support/Adobe/CEP/extensions'   # macOS user
    ]
    
    for pattern in extension_patterns:
        expanded_pattern = os.path.expanduser(pattern)
        if os.path.exists(expanded_pattern):
            # Look for our extension
            for ext_dir in os.listdir(expanded_pattern):
                if 'Y2P' in ext_dir or 'youtube' in ext_dir.lower():
                    exec_dir = os.path.join(expanded_pattern, ext_dir, 'exec')
                    if os.path.exists(exec_dir):
                        possible_locations.append(exec_dir)
    
    # 3. Extension root environment variable
    extension_root = os.environ.get('EXTENSION_ROOT', '')
    if extension_root:
        possible_locations.extend([
            extension_root,
            os.path.join(extension_root, 'exec'),
        ])
    
    # 4. Standard fallback locations
    possible_locations.extend([
        os.path.dirname(script_dir),  # Parent directory
        script_dir,  # Current directory
        os.path.join(script_dir, 'ffmpeg'),  # ffmpeg subdirectory
        os.path.join(os.path.dirname(script_dir), 'ffmpeg'),  # Parent's ffmpeg subdirectory
        working_dir,
        os.path.dirname(working_dir),
    ])
    
    # Add macOS specific paths including _internal
    if sys.platform == 'darwin':
        # Add _internal paths for macOS PyInstaller builds
        possible_locations.extend([
            os.path.join(working_dir, '_internal'),
            os.path.join(exec_from_working, '_internal') if 'exec_from_working' in locals() else None,
        ])
        
        # Filter out None values
        possible_locations = [loc for loc in possible_locations if loc is not None]
        
        possible_locations.extend([
            '/usr/local/bin',
            '/opt/homebrew/bin',
            '/usr/bin',
            os.path.expanduser('~/bin'),
            # Add common homebrew installation paths
            '/opt/homebrew/Cellar/ffmpeg',
            '/usr/local/Cellar/ffmpeg'
        ])
        
        # Try to find installed ffmpeg via 'which' command
        try:
            which_result = subprocess.run(['which', 'ffmpeg'], 
                                           stdout=subprocess.PIPE, 
                                           stderr=subprocess.PIPE, 
                                           text=True)
            if which_result.returncode == 0 and which_result.stdout.strip():
                possible_locations.append(os.path.dirname(which_result.stdout.strip()))
                logging.info(f"Found ffmpeg via 'which' at: {which_result.stdout.strip()}")
        except:
            pass
    
    # Filter out empty paths and remove duplicates while preserving order
    possible_locations = list(dict.fromkeys(filter(None, possible_locations)))
    
    ffmpeg_name = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
    
    # First try direct paths
    for location in possible_locations:
        ffmpeg_path = os.path.join(location, ffmpeg_name)
        if os.path.exists(ffmpeg_path):
            logging.info(f"Found ffmpeg at: {ffmpeg_path}")
            # On Windows, use a simpler file existence check when running from Premiere
            if sys.platform == 'win32':
                file_size = os.path.getsize(ffmpeg_path)
                # If the file is large enough to be a valid ffmpeg executable, assume it works
                if file_size > 1000000:  # Typical ffmpeg.exe is several MB
                    logging.info(f"Assuming ffmpeg is valid based on file size ({file_size} bytes): {ffmpeg_path}")
                    return ffmpeg_path
                logging.warning(f"Found ffmpeg at {ffmpeg_path} but size is suspiciously small: {file_size} bytes")
                continue
                
            # On Unix-like systems, verify permissions
            if sys.platform != 'win32':
                if not os.access(ffmpeg_path, os.X_OK):
                    logging.warning(f"FFmpeg found at {ffmpeg_path} but is not executable")
                    continue
                    
            # OPTIMIZATION: Check cache first to avoid repeated subprocess calls
            current_time = time.time()
            global _ffmpeg_path_cached, _ffmpeg_cache_time
            if (_ffmpeg_path_cached == ffmpeg_path and 
                (current_time - _ffmpeg_cache_time) < _ffmpeg_cache_ttl):
                logging.debug(f"Using cached FFmpeg verification for: {ffmpeg_path}")
                return ffmpeg_path
            
            # Try to run ffmpeg -version to verify it works
            try:
                # Use shell=True on Windows to avoid handle issues
                use_shell = sys.platform == 'win32'
                cmd = [ffmpeg_path, '-version'] if not use_shell else f'"{ffmpeg_path}" -version'
                
                result = subprocess.run(
                    cmd,
                    shell=use_shell,
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    timeout=5,
                    text=True
                )
                
                if result.returncode == 0 and 'ffmpeg version' in result.stdout:
                    logging.info(f"FFmpeg verified and working: {ffmpeg_path}")
                    # Cache the result
                    _ffmpeg_path_cached = ffmpeg_path
                    _ffmpeg_cache_time = current_time
                    return ffmpeg_path
                else:
                    logging.warning(f"FFmpeg found at {ffmpeg_path} but failed version check: {result.stderr}")
            except Exception as e:
                logging.warning(f"Error verifying ffmpeg at {ffmpeg_path}: {str(e)}")
                # If on Windows, return the path anyway if the file exists and is large enough
                if sys.platform == 'win32' and os.path.exists(ffmpeg_path) and os.path.getsize(ffmpeg_path) > 1000000:
                    logging.info(f"Despite verification error, using ffmpeg at: {ffmpeg_path}")
                    # Cache the result
                    _ffmpeg_path_cached = ffmpeg_path
                    _ffmpeg_cache_time = current_time
                    return ffmpeg_path
                continue
    
    # If not found in standard paths, try looking for ffmpeg in PATH
    try:
        # Try multiple methods to find ffmpeg in PATH
        if sys.platform == 'darwin':
            # On macOS, try running ffmpeg directly as it might be in PATH
            result = subprocess.run(['ffmpeg', '-version'], 
                                 stdout=subprocess.PIPE, 
                                 stderr=subprocess.PIPE,
                                 timeout=5)
            if result.returncode == 0 and 'ffmpeg version' in result.stdout.decode():
                logging.info("Found working ffmpeg in PATH")
                return 'ffmpeg'  # Return just 'ffmpeg' to use PATH resolution
            
            # If direct execution fails, try 'which' command
            which_result = subprocess.run(['which', 'ffmpeg'], 
                                        stdout=subprocess.PIPE, 
                                        stderr=subprocess.PIPE,
                                        text=True)
            if which_result.returncode == 0 and which_result.stdout.strip():
                ffmpeg_in_path = which_result.stdout.strip()
                # Verify this ffmpeg works
                test_result = subprocess.run([ffmpeg_in_path, '-version'],
                                           stdout=subprocess.PIPE,
                                           stderr=subprocess.PIPE,
                                           timeout=5)
                if test_result.returncode == 0:
                    logging.info(f"Found working ffmpeg via which: {ffmpeg_in_path}")
                    return ffmpeg_in_path
                    
        elif sys.platform == 'win32':
            # On Windows, try 'where' command
            where_result = subprocess.run(['where', 'ffmpeg'], 
                                        shell=True,
                                        stdout=subprocess.PIPE, 
                                        stderr=subprocess.PIPE,
                                        text=True)
            if where_result.returncode == 0 and where_result.stdout.strip():
                ffmpeg_in_path = where_result.stdout.strip().split('\n')[0]
                if os.path.exists(ffmpeg_in_path) and os.path.getsize(ffmpeg_in_path) > 1000000:
                    logging.info(f"Found ffmpeg via where: {ffmpeg_in_path}")
                    return ffmpeg_in_path
        
    except Exception as e:
        logging.warning(f"Error checking ffmpeg in PATH: {str(e)}")

    logging.error("FFmpeg not found in any of the expected locations")
    logging.error(f"Searched locations: {possible_locations}")
    
    # Try the app_init module's find_ffmpeg as last resort
    try:
        from app_init import find_ffmpeg as init_find_ffmpeg
        init_ffmpeg = init_find_ffmpeg()
        if init_ffmpeg:
            logging.info(f"Found ffmpeg via app_init module: {init_ffmpeg}")
            return init_ffmpeg
    except Exception as e:
        logging.warning(f"Error using app_init find_ffmpeg: {str(e)}")
        
    return None

def check_ffmpeg(settings, socketio):
    """Check if ffmpeg is available and working"""
    global _ffmpeg_verified, _ffmpeg_path_cached
    
    # Check cache first - avoid repeated verification
    if _ffmpeg_verified and _ffmpeg_path_cached:
        logging.debug("FFmpeg verification served from cache")
        return {'success': True, 'path': _ffmpeg_path_cached}
    
    # Cache miss - verify FFmpeg
    logging.debug("FFmpeg cache miss - verifying FFmpeg")
    
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        error_msg = "FFmpeg not found. Please ensure ffmpeg is properly installed."
        logging.error(error_msg)
        if socketio:
            socketio.emit('error', {'message': error_msg})
        return {'success': False, 'message': error_msg}
    
    # Verify FFmpeg actually works
    try:
        if ffmpeg_path == 'ffmpeg':
            # If it's just 'ffmpeg', try to run it directly (PATH resolution)
            test_cmd = ['ffmpeg', '-version']
        else:
            # Use the full path
            test_cmd = [ffmpeg_path, '-version']
        
        # Test FFmpeg
        result = subprocess.run(test_cmd, 
                              capture_output=True, 
                              text=True, 
                              timeout=10)
        
        if result.returncode == 0 and 'ffmpeg version' in result.stdout:
            logging.info(f"FFmpeg verified and working: {ffmpeg_path}")
            
            # Update cache
            _ffmpeg_verified = True
            _ffmpeg_path_cached = ffmpeg_path
            
            # Store the verified path in settings for later use
            if settings is not None:
                settings['ffmpeg_path'] = ffmpeg_path
            return {'success': True, 'path': ffmpeg_path}
        else:
            error_msg = f"FFmpeg found but not working properly: {ffmpeg_path}"
            logging.error(error_msg)
            logging.error(f"FFmpeg test output: {result.stderr}")
            if socketio:
                socketio.emit('error', {'message': error_msg})
            return {'success': False, 'message': error_msg}
            
    except subprocess.TimeoutExpired:
        error_msg = f"FFmpeg test timed out: {ffmpeg_path}"
        logging.error(error_msg)
        if socketio:
            socketio.emit('error', {'message': error_msg})
        return {'success': False, 'message': error_msg}
    except Exception as e:
        error_msg = f"Error testing FFmpeg: {str(e)}"
        logging.error(error_msg)
        if socketio:
            socketio.emit('error', {'message': error_msg})
        # On macOS, if direct test fails but file exists, try to continue anyway
        if sys.platform == 'darwin' and ffmpeg_path != 'ffmpeg':
            if os.path.exists(ffmpeg_path) and os.access(ffmpeg_path, os.X_OK):
                logging.warning(f"FFmpeg test failed but file exists and is executable, continuing anyway: {ffmpeg_path}")
                if settings is not None:
                    settings['ffmpeg_path'] = ffmpeg_path
                return {'success': True, 'path': ffmpeg_path}
        return {'success': False, 'message': error_msg}

def validate_license(license_key):
    """
    Validate license via secure API proxy
    No API keys are stored in this code - they're on the backend
    """
    if not license_key:
        return False

    try:
        from config import LICENSE_API_URL, API_TIMEOUT
        
        response = requests.post(
            LICENSE_API_URL,
            json={'licenseKey': license_key},
            timeout=API_TIMEOUT,
            headers={'Content-Type': 'application/json'}
        )

        if response.ok:
            result = response.json()
            is_valid = result.get('success', False)
            if is_valid:
                logging.info(f"License validated via {result.get('provider', 'unknown')}")
            return is_valid
        else:
            logging.warning(f"License validation failed with status {response.status_code}")
            return False

    except requests.Timeout:
        logging.error("License validation timeout")
        return False
    except Exception as e:
        logging.error(f"Error validating license: {e}")
        return False

def handle_video_url(video_url, download_type, current_download, socketio, settings, clip_start=None, clip_end=None, cookies=None, user_agent=None):
    """
    Handle video URL processing based on the download type.
    """
    try:
        # Validate and prepare environment
        ffmpeg_check_result = check_ffmpeg(settings, socketio)
        if not ffmpeg_check_result['success']:
            return {"error": ffmpeg_check_result['message']}
        
        # Get FFmpeg path
        ffmpeg_path = ffmpeg_check_result['path']
        if not ffmpeg_path:
            return {"error": "FFmpeg path not set in settings"}
            
        # Get download parameters from settings
        resolution = settings.get('resolution', '1080')
        download_mp3 = settings.get('downloadMP3', False)
        download_path = settings.get('downloadPath', '')
        
        # Validate license if required
        if download_type == 'video':
            license_valid = validate_license(settings.get('licenseKey'))
            if not license_valid:
                return {"error": "Invalid license. Please purchase a license to download videos."}
        
        # If no download path is set, use a default path
        if not download_path:
            download_path = get_default_download_path(socketio)
            if not download_path:
                return {"error": "Download path not set and could not determine default"}
        
        logging.info(f"Processing {download_type} request for {video_url}")
        logging.info(f"Settings: resolution={resolution}, download_path={download_path}, download_mp3={download_mp3}")
        
        if download_type == 'audio':
            # Process audio download
            result = download_audio(
                video_url=video_url, 
                download_path=download_path,
                ffmpeg_path=ffmpeg_path,
                socketio=socketio,
                current_download=current_download,
                settings=settings,
                cookies=cookies,
                user_agent=user_agent
            )
            
            if result and os.path.exists(result):
                socketio.emit('import_video', {'path': result})
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                return {"success": True, "path": result}
            else:
                return {"error": "Failed to download audio"}
                
        elif download_type == 'clip':
            # Validate clip parameters
            if clip_start is None or clip_end is None:
                return {"error": "Clip start and end times must be provided"}
                
            if clip_start >= clip_end:
                return {"error": "Clip start time must be less than end time"}
            
            # Process clip download
            result = download_and_process_clip(
                video_url=video_url,
                resolution=resolution,
                download_path=download_path,
                clip_start=clip_start,
                clip_end=clip_end,
                download_mp3=download_mp3,
                ffmpeg_path=ffmpeg_path,
                socketio=socketio,
                settings=settings,
                current_download=current_download,
                cookies=cookies,
                user_agent=user_agent
            )
            
            if result and result.get("success") and result.get("path") and os.path.exists(result["path"]):
                # Emit SocketIO event for Premiere extension
                socketio.emit('import_video', {'path': result["path"]})
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                return {"success": True, "path": result["path"]}
            else:
                error_msg = result.get("error") if result and "error" in result else "Failed to download clip"
                return {"error": error_msg}
        else:
            # Process regular video download (default case)
            result = download_video(
                video_url=video_url,
                resolution=resolution,
                download_path=download_path,
                download_mp3=download_mp3,
                ffmpeg_path=ffmpeg_path,
                socketio=socketio,
                settings=settings,
                current_download=current_download,
                cookies=cookies,
                user_agent=user_agent
            )
            
            if result and os.path.exists(result):
                # Import signal already sent by download_video function
                logging.info(f"Download completed successfully: {result}")
                return {"success": True, "path": result}
            else:
                return {"error": "Failed to download video"}
                
    except Exception as e:
        error_message = f"Error processing URL: {str(e)}"
        context = {
            'video_url': video_url,
            'download_type': download_type,
            'settings': {k: v for k, v in settings.items() if k not in ['licenseKey']},  # Exclude sensitive data
            'clip_start': clip_start,
            'clip_end': clip_end
        }
        write_error_log(error_message, context)
        logging.error(error_message)
        return {"error": error_message}

def sanitize_resolution(resolution):
    """Convert resolution string to a clean integer value"""
    if isinstance(resolution, int):
        return resolution
    
    # Strip 'p' suffix if present
    if isinstance(resolution, str):
        resolution = resolution.lower().replace('p', '').strip()
    
    # Convert to integer
    try:
        return int(resolution)
    except (ValueError, TypeError):
        # Default to 1080 if conversion fails
        return 1080

def download_and_process_clip(video_url, resolution, download_path, clip_start, clip_end, download_mp3, ffmpeg_path, socketio, settings, current_download, cookies=None, user_agent=None):
    clip_duration = clip_end - clip_start
    logging.info(f"Received clip parameters: clip_start={clip_start}, clip_end={clip_end}, clip_duration={clip_duration}")

    # Clean up PATH environment variable to avoid conflicts
    clean_environment_path()

    # Clean up resources before starting new download to prevent accumulation
    logging.info("Cleaning up resources before clip download...")
    cleanup_ffmpeg_processes()
    cleanup_temporary_cookies()

    # Check if download path exists or try to get default path
    if not download_path:
        download_path = get_default_download_path(socketio)
        if not download_path:
            error_msg = "Could not determine download path. Please open a Premiere Pro project."
            logging.error(error_msg)
            socketio.emit('download-failed', {'message': error_msg})
            return {"error": error_msg}
            
    logging.info(f"Using download path: {download_path}")

    # Ensure the path exists
    try:
        os.makedirs(download_path, exist_ok=True)
        logging.info(f"Ensured download directory exists: {download_path}")
    except Exception as e:
        error_msg = f"Could not create download directory: {str(e)}"
        logging.error(error_msg)
        socketio.emit('download-failed', {'message': error_msg})
        return {"error": error_msg}

    try:
        # Ensure ffmpeg path is valid
        if not ffmpeg_path:
            logging.error("FFmpeg path not provided")
            socketio.emit('download-failed', {'message': 'FFmpeg not found. Please check settings.'})
            return {"error": "FFmpeg not found at specified path"}
            
        # Start with loading animation - no percentage for clips
        pass
                
        # Handle cancellation
        is_cancelled = [False]
        def cancel_callback():
            is_cancelled[0] = True
            return is_cancelled[0]
        
        current_download['cancel_callback'] = cancel_callback
                
        # Prepare authentication first
        cookies_file = None
        browser_cookies = None
        
        if cookies:
            cookies_file = create_cookies_file(cookies)
            if not cookies_file:
                cookies_file = get_youtube_cookies_file()
        else:
            cookies_file = get_youtube_cookies_file()
            if not cookies_file:
                browser_cookies = try_extract_cookies_from_browser()
        
        # Get sanitized title for the output file with authentication
        sanitized_title = ''
        try:
            # Use comprehensive headers and auth for title extraction
            title_ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=cookies_file, user_agent=user_agent)
            title_ydl_opts['quiet'] = True
            title_ydl_opts['skip_download'] = True
            
            # CRITICAL: Remove ANY options that could trigger format validation
            format_related_keys = ['format', 'format_sort', 'format_sort_force']
            for key in format_related_keys:
                if key in title_ydl_opts:
                    del title_ydl_opts[key]
            
            # Add browser cookies if that's what we're using
            if browser_cookies:
                title_ydl_opts['cookiesfrombrowser'] = browser_cookies
                logging.info(f"Using cookies from browser for title extraction: {browser_cookies[0]}")
            
            with yt_dlp.YoutubeDL(title_ydl_opts) as ydl:
                video_info = ydl.extract_info(video_url, download=False)
                if video_info:
                    sanitized_title = sanitize_youtube_title(video_info.get('title', 'video'))
                    logging.info(f"Successfully extracted title for clip: {sanitized_title}")
                else:
                    sanitized_title = 'clip_' + str(int(time.time()))
        except Exception as e:
            logging.error(f"Error extracting video info for clip naming: {str(e)}")
            sanitized_title = 'clip_' + str(int(time.time()))
            
        # Get unique filename
        unique_filename = get_unique_filename(download_path, sanitized_title + '_clip', 'mp4')
        video_file_path = os.path.join(download_path, unique_filename)
        logging.info(f"Setting output path to: {video_file_path}")

        # Get preferred audio language from settings
        preferred_language = settings.get('preferredAudioLanguage', 'original')
        logging.info(f"Using preferred audio language for clip: {preferred_language}")
        
        # Format string for the desired quality - Prioritize AVC1 for Premiere Pro compatibility
        # but with flexible fallbacks if truly not available
        sanitized_resolution = sanitize_resolution(resolution)
        if preferred_language != 'original':
            # Try with language preference, prioritizing AVC1/H.264
            format_str = (
                # First: AVC1 with language preference
                f'bestvideo[height<={sanitized_resolution}][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a][language~="{preferred_language}"]/'
                f'bestvideo[height<={sanitized_resolution}][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/'
                f'bestvideo[height<={sanitized_resolution}][vcodec*=avc]+bestaudio[ext=m4a]/'
                # Then: Any H.264 codec variant
                f'bestvideo[height<={sanitized_resolution}][vcodec*=264]+bestaudio/'
                # Then: Combined AVC1 formats
                f'best[height<={sanitized_resolution}][vcodec^=avc1][ext=mp4]/'
                f'best[height<={sanitized_resolution}][vcodec*=avc]/'
                # Fallback: Any video+audio at resolution (still prefer mp4)
                f'bestvideo[height<={sanitized_resolution}][ext=mp4]+bestaudio/'
                f'best[height<={sanitized_resolution}][ext=mp4]/'
                # Last resort: any format
                f'best[height<={sanitized_resolution}]/best'
            )
        else:
            # Prioritize AVC1/H.264 for maximum Premiere Pro compatibility
            format_str = (
                # Priority 1: AVC1 at resolution (best for Premiere)
                f'bestvideo[height<={sanitized_resolution}][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/'
                f'bestvideo[height<={sanitized_resolution}][vcodec^=avc1]+bestaudio/'
                f'bestvideo[height<={sanitized_resolution}][vcodec*=avc]+bestaudio/'
                # Priority 2: Any H.264 variant at resolution
                f'bestvideo[height<={sanitized_resolution}][vcodec*=264]+bestaudio/'
                # Priority 3: Combined AVC1 formats
                f'best[height<={sanitized_resolution}][vcodec^=avc1][ext=mp4]/'
                f'best[height<={sanitized_resolution}][vcodec*=avc]/'
                # Priority 4: Any mp4 at resolution
                f'bestvideo[height<={sanitized_resolution}][ext=mp4]+bestaudio[ext=m4a]/'
                f'best[height<={sanitized_resolution}][ext=mp4]/'
                # Last resort: best available
                f'best[height<={sanitized_resolution}]/best'
            )
        logging.info(f"Using AVC1-prioritized format string with fallbacks: {format_str}")
        
        # Configure download ranges for clip extraction
        clip_duration = clip_end - clip_start
        logging.info(f"Clip download configured: start={clip_start}s, end={clip_end}s, duration={clip_duration}s")
        
        # Progress hook to track download progress and send updates
        # Progress throttling variables for clips
        last_progress_time_clip = [0]  # Use list to make it mutable in nested function
        last_progress_value_clip = [0]
        
        def progress_hook(d):
            # Check for cancellation first - throw exception to stop yt-dlp
            if is_cancelled[0]:
                logging.info('[CANCEL] Clip progress hook detected cancellation, raising exception to stop yt-dlp')
                raise Exception('Download cancelled by user')
            
            # Log the selected format info for clips (only once)
            if d['status'] == 'downloading' and 'info_dict' in d:
                info = d.get('info_dict', {})
                vcodec = info.get('vcodec', 'unknown')
                acodec = info.get('acodec', 'unknown')
                ext = info.get('ext', 'unknown')
                format_id = info.get('format_id', 'unknown')
                height = info.get('height', 'unknown')
                
                # Only log once per download
                if not hasattr(progress_hook, 'format_logged'):
                    progress_hook.format_logged = True
                    is_avc1 = 'avc1' in vcodec.lower() or 'avc' in vcodec.lower() or '264' in vcodec.lower()
                    codec_status = "[CLIP AVC1-OK]" if is_avc1 else "[CLIP NON-AVC1-WARNING]"
                    logging.info(f"{codec_status} Selected format: {format_id}, vcodec={vcodec}, acodec={acodec}, ext={ext}, height={height}p")
                    if not is_avc1:
                        logging.warning(f"WARNING: Non-AVC1 codec selected for clip - may require transcoding in Premiere Pro!")
                
            if d['status'] == 'downloading':
                try:
                    percentage = d.get('_percent_str', '0%')
                    # Remove ANSI color codes if present
                    percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                    percentage = percentage.strip()
                    
                    # Extract numeric value to throttle logging
                    percentage_num = 0
                    clean_str = percentage.replace('%', '').replace(' ', '')
                    if clean_str.replace('.', '').isdigit():
                        try:
                            percentage_num = int(float(clean_str))
                        except:
                            pass
                    
                    # Only log every 10% or if value increased significantly
                    if percentage_num % 10 == 0 or percentage_num > last_progress_value_clip[0] + 5:
                        logging.info(f'[PROGRESS] Clip Progress: {percentage}')
                        last_progress_value_clip[0] = percentage_num
                    
                    # No percentage emission for clips - just keep loading animation
                except Exception as e:
                    if 'cancelled' in str(e).lower():
                        raise e  # Re-raise cancellation exceptions
                    logging.error(f"Error in clip progress hook: {e}")
            elif d['status'] == 'finished':
                logging.info('[FINISHED] Clip download finished')
                # No percentage emission for clips - animation will stop when complete

        # Configure yt-dlp options with robust settings for clip download (including auth and comprehensive headers)
        ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=cookies_file, user_agent=user_agent)
        ydl_opts.update({
            'format': format_str,
            'outtmpl': video_file_path,
            'force_keyframes_at_cuts': True,
            'download_ranges': lambda info_dict, ydl: [{'start_time': clip_start, 'end_time': clip_end}],  # Function that returns ranges as dicts
            'no_part': True,
            'progress_hooks': [progress_hook],
        })
        
        # Add browser cookies if that's what we're using (fallback when no cookies file)
        if browser_cookies:
            ydl_opts['cookiesfrombrowser'] = browser_cookies
            logging.info("Using browser cookies for clip download")
        
        # Download with yt-dlp
        # Note: We need to allow yt-dlp to capture progress information
        # so we can't completely redirect stdout/stderr on Windows.
        # Instead, we'll use a safer approach that preserves progress hooks
        # Download with yt-dlp (AVC1 format only, no fallback)
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                current_download['ydl'] = ydl
                logging.info('[DOWNLOAD] Set ydl object in current_download structure for clip download')
                
                # Log the environment variables related to ffmpeg
                logging.info(f"Environment PATH: {os.environ.get('PATH')}")
                logging.info(f"Environment FFMPEG_PATH: {os.environ.get('FFMPEG_PATH')}")
                
                # Verify ffmpeg actually exists at the path
                if not os.path.exists(ffmpeg_path):
                    logging.error(f"FFmpeg executable not found at configured path: {ffmpeg_path}")
                    socketio.emit('download-failed', {'message': f"FFmpeg executable not found at: {ffmpeg_path}"})
                    return {"error": f"FFmpeg executable not found at: {ffmpeg_path}"}
                
                logging.info(f"Starting clip download for {video_url} using AVC1 format and ffmpeg at {ffmpeg_path}")
                
                # Emit initial progress for clip
                progress_data = {
                    'progress': '0',
                    'percentage': '0%',
                    'type': 'clip',
                    'status': 'downloading'
                }
                socketio.emit('progress', progress_data)
                socketio.emit('percentage', {'percentage': '0%'})
                
                ydl.download([video_url])
                
                # Check if the download was canceled
                if is_cancelled[0]:
                    if os.path.exists(video_file_path):
                        os.remove(video_file_path)
                    return {"error": "Download cancelled by user"}
        
        except Exception as e:
            error_message = f"Error downloading clip: {str(e)}"
            
            # Check if this is a cancellation exception
            if 'cancelled' in str(e).lower():
                logging.info("Clip download cancelled by user")
                # Clean up all partial files created by yt-dlp for clips
                cleanup_partial_video_files(video_file_path)
                logging.info('[CANCEL] Clip download successfully cancelled - cleanup completed')
                return {"error": "Download cancelled by user"}
            
            # Log detailed context for debugging
            log_download_context(e, {
                'function': 'download_and_process_clip',
                'video_url': video_url,
                'resolution': resolution,
                'clip_start': clip_start,
                'clip_end': clip_end,
                'video_file_path': video_file_path,
                'ffmpeg_path': ffmpeg_path
            })
            
            logging.error(error_message)
            logging.error(f"Exception type: {type(e).__name__}")
            
            # Check for Windows-specific stdout/stderr issues
            if "[Errno 22]" in str(e) or "Invalid argument" in str(e) or "BrokenPipeError" in str(type(e)):
                error_message = "Clip download failed due to Windows output stream issue. This has been fixed in the latest version. Please try again."
                logging.error("Windows stdout/stderr pipe error detected during clip download - fix has been applied")
            # Check if error is related to ffmpeg
            elif 'ffmpeg' in str(e).lower() or 'executable' in str(e).lower():
                logging.error(f"FFmpeg-related error detected. Current ffmpeg path: {ffmpeg_path}")
                # Suggest potential solutions
                solutions = "Try restarting the application or using a different clip download approach."
                error_message += f" This appears to be related to ffmpeg. {solutions}"
            
            socketio.emit('download-failed', {'message': error_message})
            return {"error": error_message}
        
        # Cleanup after download
        try:
            current_download['ydl'] = None
            current_download['cancel_callback'] = None
            
            # Clean up the cookies file after download (Windows only)
            if sys.platform == 'win32' and cookies_file and os.path.exists(cookies_file):
                try:
                    os.remove(cookies_file)
                    logging.info(f"[Windows] Cleaned up temporary cookies file: {cookies_file}")
                except Exception as e:
                    logging.debug(f"Could not remove cookies file: {e}")
        except Exception as cleanup_error:
            logging.debug(f"Error during cleanup: {cleanup_error}")
        
        # Add metadata to the video file if it exists
        if os.path.exists(video_file_path):
            logging.info(f"Clip downloaded successfully: {video_file_path}")

            # Add URL to metadata using hidden subprocess to prevent CMD popup
            metadata_command = [
                ffmpeg_path,
                '-i', video_file_path,
                '-metadata', f'comment={video_url}',
                '-metadata', f'clip_start={clip_start}',
                '-metadata', f'clip_end={clip_end}',
                '-codec', 'copy'
            ] + get_ffmpeg_postprocessor_args() + [
                f'{video_file_path}_with_metadata.mp4'
            ]

            try:
                run_hidden_subprocess(metadata_command, check=True, capture_output=True, text=True)
                os.replace(f'{video_file_path}_with_metadata.mp4', video_file_path)
                logging.info(f"Metadata added: {video_file_path}")
                
                # Emit events
                socketio.emit('complete', {'type': 'clip', 'message': 'Clip téléchargé avec succès'})
                socketio.emit('download-complete', {'url': video_url, 'path': video_file_path})
                socketio.emit('import_video', {'path': video_file_path})
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                return {"success": True, "path": video_file_path}
            except subprocess.CalledProcessError as e:
                logging.error(f"Error adding metadata: {e.stderr}")
                # Continue anyway, as the clip itself is fine
                socketio.emit('download-complete', {'url': video_url, 'path': video_file_path})
                socketio.emit('import_video', {'path': video_file_path})
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                return {"success": True, "path": video_file_path}
        else:
            error_message = "Clip download failed - output file not found"
            logging.error(error_message)
            socketio.emit('download-failed', {'message': error_message})
            return {"error": error_message}

    except Exception as e:
        error_message = f"Error downloading clip: {str(e)}"
        logging.error(error_message)
        logging.error(f"Full error details: {type(e).__name__}")
        socketio.emit('download-failed', {'message': error_message})
        return {"error": error_message}

def sanitize_youtube_title(title):
    # Remove invalid filename characters and strip excess whitespace
    sanitized_title = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', title).strip()
    # Replace problematic characters with underscores
    sanitized_title = re.sub(r'\s+', '_', sanitized_title)
    return sanitized_title

def get_unique_filename(base_path, filename, extension):
    """
    Generate a unique filename by adding incremental numbers if the file already exists.
    Example: if 'video.mp4' exists, try 'video_1.mp4', 'video_2.mp4', etc.
    """
    if not os.path.exists(os.path.join(base_path, f"{filename}.{extension}")):
        return f"{filename}.{extension}"
    
    counter = 1
    while os.path.exists(os.path.join(base_path, f"{filename}_{counter}.{extension}")):
        counter += 1
    
    return f"{filename}_{counter}.{extension}"

def download_video(video_url, resolution, download_path, download_mp3, ffmpeg_path, socketio, settings, current_download, cookies=None, user_agent=None):
    # Clean up PATH environment variable to avoid conflicts
    clean_environment_path()
    
    # Clean up resources before starting new download to prevent accumulation
    logging.info("Cleaning up resources before video download...")
    cleanup_ffmpeg_processes()
    cleanup_temporary_cookies()
    
    check_result = check_ffmpeg(settings, socketio)
    if not check_result['success']:
        return None

    try:
        import yt_dlp

        # Handle cancellation
        is_cancelled = [False]
        def cancel_callback():
            is_cancelled[0] = True
            logging.info('[CANCEL] Video download cancel callback triggered, setting is_cancelled to True')
            return is_cancelled[0]
        
        current_download['cancel_callback'] = cancel_callback
        logging.info('[DOWNLOAD] Set video cancel_callback in current_download structure')

        # Progress throttling variables (use lists to make them mutable in nested functions)
        last_progress_time = [0]
        last_progress_value = [0]
        
        # Simple progress hook like the old working version
        def progress_hook(d):
            # LOG: Hook is being called (debug)
            status = d.get('status', 'unknown')
            if status == 'downloading':
                # Log first time to confirm hook is working
                if not hasattr(progress_hook, 'hook_confirmed'):
                    progress_hook.hook_confirmed = True
                    logging.info('[DEBUG] Full video progress hook is being called successfully')
            
            # Check for cancellation first - throw exception to stop yt-dlp
            if is_cancelled[0]:
                logging.info('[CANCEL] Progress hook detected cancellation, raising exception to stop yt-dlp')
                raise Exception('Download cancelled by user')
            
            # Log the selected format info (only once)
            if d['status'] == 'downloading' and 'info_dict' in d:
                info = d.get('info_dict', {})
                vcodec = info.get('vcodec', 'unknown')
                acodec = info.get('acodec', 'unknown')
                ext = info.get('ext', 'unknown')
                format_id = info.get('format_id', 'unknown')
                height = info.get('height', 'unknown')
                
                # Only log once per download
                if not hasattr(progress_hook, 'format_logged'):
                    progress_hook.format_logged = True
                    is_avc1 = 'avc1' in vcodec.lower() or 'avc' in vcodec.lower() or '264' in vcodec.lower()
                    codec_status = "[FULL AVC1-OK]" if is_avc1 else "[FULL NON-AVC1-WARNING]"
                    logging.info(f"{codec_status} Selected format: {format_id}, vcodec={vcodec}, acodec={acodec}, ext={ext}, height={height}p")
                    if not is_avc1:
                        logging.warning(f"WARNING: Non-AVC1 codec selected - video may require transcoding in Premiere Pro!")
                
            if d['status'] == 'downloading':
                try:
                    percentage_str = d.get('_percent_str', '0%')
                    # Remove ANSI color codes if present
                    percentage_str = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage_str)
                    percentage_str = percentage_str.strip()
                    
                    # Extract numeric value from percentage string
                    percentage_num = 0
                    if percentage_str:
                        # Remove % and spaces, then try to parse
                        clean_str = percentage_str.replace('%', '').replace(' ', '').replace(',', '.')
                        try:
                            percentage_num = int(float(clean_str))
                        except ValueError:
                            # If parsing fails, log it for debugging
                            logging.debug(f'[DEBUG] Could not parse percentage: {percentage_str}')
                            percentage_num = 0
                    
                    # IMPROVED THROTTLING: Only emit if percentage INCREASED or is 100%
                    # This prevents flooding with 0% updates during initialization
                    if percentage_num > last_progress_value[0] or percentage_num == 100:
                        # OPTIMIZATION: Only log key percentages to reduce I/O overhead
                        if percentage_num % 10 == 0 or percentage_num == 100:
                            logging.info(f'[PROGRESS] Video Progress: {percentage_num}%')
                        # Emit progress to all connected clients (broadcast)
                        socketio.emit('progress', {'progress': str(percentage_num), 'type': 'full'})
                        socketio.emit('percentage', {'percentage': percentage_str if percentage_str else f'{percentage_num}%'})
                        last_progress_value[0] = percentage_num
                    # Silently skip updates that don't increase progress (especially 0%)
                except Exception as e:
                    if 'cancelled' in str(e).lower():
                        raise e  # Re-raise cancellation exceptions
                    logging.error(f"Error in full video progress hook: {e}")
            elif d['status'] == 'finished':
                logging.info('[FINISHED] Video download finished')
                # Emit progress to all connected clients (broadcast)
                socketio.emit('progress', {'progress': '100', 'type': 'full'})
                socketio.emit('percentage', {'percentage': '100%'})
                last_progress_value[0] = 100

        # Get preferred audio language from settings
        preferred_language = settings.get('preferredAudioLanguage', 'original')
        logging.info(f"Using preferred audio language: {preferred_language}")
        
        # Create simple and flexible format string
        # With Deno enabled, yt-dlp can now access all formats, so we simplify the selection
        max_height = int(resolution.replace("p", ""))
        
        format_options = []
        
        # Priority: best video+audio at requested resolution
        if preferred_language != 'original':
            # Try language-specific first
            format_options.extend([
                f'bestvideo[height<={max_height}]+bestaudio[language~="{preferred_language}"]',
                f'best[height<={max_height}][language~="{preferred_language}"]',
            ])
        
        # Main format strategy: STRONGLY prefer AVC1/H.264 for Premiere Pro compatibility
        # Only fallback to other codecs if absolutely no AVC1 formats exist
        format_options.extend([
            # Priority 1: Best AVC1/H.264 video at resolution + best audio (separate streams for max quality)
            f'bestvideo[height<={max_height}][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]',
            f'bestvideo[height<={max_height}][vcodec^=avc1]+bestaudio',
            
            # Priority 2: Any H.264 variant (avc) at resolution + audio
            f'bestvideo[height<={max_height}][vcodec*=avc]+bestaudio',
            f'bestvideo[height<={max_height}][vcodec*=264]+bestaudio',
            
            # Priority 3: Combined AVC1 format at resolution
            f'best[height<={max_height}][vcodec^=avc1][ext=mp4]',
            f'best[height<={max_height}][vcodec*=avc]',
            f'best[height<={max_height}][vcodec*=264]',
            
            # Priority 4: AVC1 at any resolution (better to have AVC1 at higher res than non-AVC1 at target res)
            'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]',
            'bestvideo[vcodec^=avc1]+bestaudio',
            'bestvideo[vcodec*=avc]+bestaudio',
            'best[vcodec^=avc1][ext=mp4]',
            'best[vcodec*=avc]',
            
            # Priority 5: Only if NO AVC1 exists, try other codecs at resolution
            f'bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]',
            f'bestvideo[height<={max_height}]+bestaudio',
            f'best[height<={max_height}][ext=mp4]',
            f'best[height<={max_height}]',
            
            # Last resort: absolutely any format (will require transcoding in Premiere)
            'best'
        ])
        
        format_string = '/'.join(format_options)
        logging.info(f"Using AVC1-prioritized format string with {len(format_options)} fallback options")
        logging.info(f"Format priority: AVC1 at resolution > AVC1 any resolution > Other codecs at resolution > Any format")

        # Check if download path exists or try to get default path
        if not download_path:
            download_path = get_default_download_path(socketio)
            if not download_path:
                error_msg = "Could not determine download path. Please open a Premiere Pro project."
                logging.error(error_msg)
                socketio.emit('download-failed', {'message': error_msg})
                return None
            
        logging.info(f"Using download path: {download_path}")

        # Ensure the path exists
        try:
            os.makedirs(download_path, exist_ok=True)
            logging.info(f"Ensured download directory exists: {download_path}")
        except Exception as e:
            error_msg = f"Could not create download directory: {str(e)}"
            logging.error(error_msg)
            socketio.emit('download-failed', {'message': error_msg})
            return None

        # Prepare authentication first
        cookies_file = None
        browser_cookies = None
        
        if cookies:
            cookies_file = create_cookies_file(cookies)
            if not cookies_file:
                # Fallback to manual cookies file
                cookies_file = get_youtube_cookies_file()
        else:
            # Check for manual cookies file or try browser extraction
            cookies_file = get_youtube_cookies_file()
            if not cookies_file:
                browser_cookies = try_extract_cookies_from_browser()
        
        # Clean the video URL to remove playlist parameters that can trigger format validation
        # YouTube URLs with &list= parameters can cause yt-dlp to validate formats even with noplaylist=True
        from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
        
        parsed_url = urlparse(video_url)
        if parsed_url.query:
            params = parse_qs(parsed_url.query)
            # Keep only the 'v' parameter (video ID) and remove playlist-related parameters
            cleaned_params = {}
            if 'v' in params:
                cleaned_params['v'] = params['v']
            
            # Rebuild URL with cleaned parameters
            if cleaned_params:
                cleaned_query = urlencode(cleaned_params, doseq=True)
                video_url_cleaned = urlunparse((
                    parsed_url.scheme,
                    parsed_url.netloc,
                    parsed_url.path,
                    parsed_url.params,
                    cleaned_query,
                    parsed_url.fragment
                ))
                if video_url_cleaned != video_url:
                    logging.info(f"Cleaned URL from {video_url} to {video_url_cleaned}")
                    video_url = video_url_cleaned
        
        # Configure initial yt-dlp options with robust settings including auth
        # For info extraction, use simple 'best' format to avoid complex format validation
        initial_ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=cookies_file, user_agent=user_agent)
        initial_ydl_opts['skip_download'] = True  # Only extract metadata, don't download yet
        
        # Add browser cookies if available (fallback when no cookies file)
        if browser_cookies:
            initial_ydl_opts['cookiesfrombrowser'] = browser_cookies
            logging.info(f"Using cookies from browser for info extraction: {browser_cookies[0]}")
        
        # Extract video info first with authentication
        # CRITICAL FIX for yt-dlp 2025.12.08+:
        # We must specify a valid format string EVEN during info extraction
        # Otherwise yt-dlp will try to validate against "best" format which may not exist
        # Use the same AVC1-prioritized format string for consistency
        initial_ydl_opts['format'] = format_string
        
        logging.info("Extracting video information with AVC1 format specification...")
        try:
            with yt_dlp.YoutubeDL(initial_ydl_opts) as ydl:
                # Extract info with our specific format - this prevents the "format not available" error
                # because yt-dlp will use our format selector that has many fallback options
                info = ydl.extract_info(video_url, download=False)
                if not info:
                    raise Exception("Could not extract video information")
                logging.info("Successfully extracted video information with AVC1 format")
        except Exception as info_error:
            # Check for cookie-related errors and retry without cookies
            if "invalid Netscape format cookies file" in str(info_error) or "CookieLoadError" in str(info_error) or "failed to load cookies" in str(info_error):
                logging.warning("Cookie format error during info extraction. Retrying without cookies...")
                try:
                    # Retry info extraction without cookies but with comprehensive headers
                    fallback_ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=None, user_agent=user_agent)
                    fallback_ydl_opts['skip_download'] = True  # Only extract metadata, don't download yet
                    fallback_ydl_opts['format'] = format_string  # Use same format string to avoid validation errors
                    
                    with yt_dlp.YoutubeDL(fallback_ydl_opts) as ydl_fallback:
                        info = ydl_fallback.extract_info(video_url, download=False)
                        if not info:
                            raise Exception("Could not extract video information")
                        logging.info("Successfully extracted video info without cookies")
                except Exception as fallback_info_error:
                    logging.error(f"Fallback info extraction also failed: {str(fallback_info_error)}")
                    raise Exception(f"Info extraction failed with and without cookies: {str(fallback_info_error)}")
            else:
                # Re-raise the original error if it's not cookie-related
                raise info_error
        
        # Check if any video formats are available (accept both combined and separate video/audio streams)
        all_formats = info.get('formats', [])
        video_formats = [f for f in all_formats if f.get('vcodec') != 'none']  # Video streams (can be video-only)
        audio_formats = [f for f in all_formats if f.get('acodec') != 'none']  # Audio streams (can be audio-only)
        combined_formats = [f for f in all_formats if f.get('vcodec') != 'none' and f.get('acodec') != 'none']  # Combined streams
        
        if not video_formats:
            error_msg = "This URL contains only images or is not a valid video. Please provide a URL to a video."
            logging.error(error_msg)
            logging.error(f"Available formats: {[f.get('format_id', 'unknown') + ' - ' + str(f.get('vcodec', 'none')) + '/' + str(f.get('acodec', 'none')) for f in all_formats[:5]]}")
            socketio.emit('download-failed', {'message': error_msg})
            return None
        
        logging.info(f"Found {len(video_formats)} video formats, {len(audio_formats)} audio formats, {len(combined_formats)} combined formats")

        # Get video details
        title = info.get('title', 'video')
        
        # Sanitize the title
        sanitized_title = sanitize_youtube_title(title)
        logging.info(f"Sanitized title: {sanitized_title}")
        
        # Get unique filename
        unique_filename = get_unique_filename(download_path, sanitized_title, 'mp4')
        output_path = os.path.join(download_path, unique_filename)
        logging.info(f"Setting output path to: {output_path}")

        # Configure download options with robust settings (including auth and comprehensive headers)
        ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=cookies_file, user_agent=user_agent)
        ydl_opts.update({
            'format': format_string,
            'merge_output_format': 'mp4',
            'progress_hooks': [progress_hook],
            'postprocessor_hooks': [lambda d: socketio.emit('percentage', {'percentage': '100%'}) if d['status'] == 'finished' else None],
            'outtmpl': {
                'default': os.path.join(download_path, os.path.splitext(unique_filename)[0] + '.%(ext)s')
            }
        })
        
        # Add browser cookies if that's what we're using (fallback when no cookies file)
        if browser_cookies:
            ydl_opts['cookiesfrombrowser'] = browser_cookies
            logging.info("Using browser cookies for download")

        # Download the video
        logging.info("Starting video download...")
        logging.info(f"[CONFIG] Progress hook configured: {progress_hook}")
        logging.info(f"[CONFIG] YT-DLP options include progress_hooks: {'progress_hooks' in ydl_opts}")
        
        # Emit initial progress
        progress_data = {
            'progress': '0',
            'percentage': '0%',
            'type': 'full',
            'status': 'downloading'
        }
        # Emit progress to all connected clients (broadcast)
        socketio.emit('progress', {'progress': '0', 'type': 'full'})
        socketio.emit('percentage', {'percentage': '0%'})
        logging.info(f"[SENT] initial progress events: progress={progress_data}")
        
        # Configure stdout/stderr to prevent Windows pipe issues
        import contextlib
        import io
        
        # Note: We need to allow yt-dlp to capture progress information
        # so we can't completely redirect stdout/stderr on Windows.
        # Instead, we'll use a safer approach that preserves progress hooks
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                current_download['ydl'] = ydl
                logging.info('[DOWNLOAD] Set ydl object in current_download structure for video download')
                
                # Check for cancellation before starting
                if is_cancelled[0]:
                    logging.info("Download cancelled before starting")
                    logging.info('[CANCEL] Video download successfully cancelled before start')
                    return None
                
                # Download with AVC1 format specified in ydl_opts (no fallback)
                # This ensures maximum Premiere Pro compatibility
                logging.info(f"Starting download with AVC1-prioritized format: {ydl_opts.get('format', 'default')[:200]}...")
                ydl.download([video_url])
        except Exception as e:
            error_message = f"Error during video download: {str(e)}"
            logging.error(error_message)
            socketio.emit('download-failed', {'message': error_message})
            raise e
        
        # Check for cancellation after download
        try:
            if is_cancelled[0]:
                logging.info("Download cancelled after completion")
                # Remove the downloaded file if it exists
                if os.path.exists(output_path):
                    try:
                        os.remove(output_path)
                        logging.info(f"Removed cancelled download file: {output_path}")
                    except Exception as e:
                        logging.error(f"Could not remove cancelled download file: {e}")
                logging.info('[CANCEL] Video download successfully cancelled after download - cleanup completed')
                return None
                    
        except Exception as e:
            error_message = f"Error during video download: {str(e)}"
            
            # Check if this is a cancellation exception
            if 'cancelled' in str(e).lower():
                logging.info("Video download cancelled by user")
                # Clean up all partial files created by yt-dlp
                cleanup_partial_video_files(output_path)
                logging.info('[CANCEL] Video download successfully cancelled - cleanup completed')
                return None
            
            # Log detailed context for debugging
            log_download_context(e, {
                'function': 'download_video',
                'video_url': video_url,
                'resolution': resolution,
                'download_path': download_path,
                'output_path': output_path,
                'format_string': format_string[:100] + '...' if len(format_string) > 100 else format_string
            })
            
            logging.error(error_message)
            logging.error(f"Exception type: {type(e).__name__}")
            
            # Check for Windows-specific stdout/stderr issues
            if "[Errno 22]" in str(e) or "Invalid argument" in str(e) or "BrokenPipeError" in str(type(e)):
                error_message = "Video download failed due to Windows output stream issue. This has been fixed in the latest version. Please try again."
                logging.error("Windows stdout/stderr pipe error detected during video download - fix has been applied")
            
            socketio.emit('download-failed', {'message': error_message})
            raise e
        finally:
            current_download['ydl'] = None
            current_download['cancel_callback'] = None
            
            # Clean up the cookies file after download (Windows only)
            if sys.platform == 'win32' and cookies_file and os.path.exists(cookies_file):
                try:
                    os.remove(cookies_file)
                    logging.info(f"[Windows] Cleaned up temporary cookies file: {cookies_file}")
                except Exception as e:
                    logging.debug(f"Could not remove cookies file: {e}")

        # Get the final path of the downloaded file
        final_path = output_path
        logging.info(f"Expected final path: {final_path}")

        # Check for downloaded files - first try exact path, then look for variants
        actual_file = None
        
        if os.path.exists(final_path):
            actual_file = final_path
            logging.info(f"File exists at expected path: {final_path}")
        else:
            # Look for separate video/audio files that need merging
            base_name = os.path.splitext(final_path)[0]
            base_dir = os.path.dirname(final_path)
            
            # Common yt-dlp separate file patterns
            video_patterns = [f"{base_name}.f*.mp4", f"{base_name}.mp4.f*"]
            audio_patterns = [f"{base_name}.f*.m4a", f"{base_name}.m4a.f*", 
                            f"{base_name}.f*.mp3", f"{base_name}.mp3.f*"]
            
            import glob
            # OPTIMIZATION: Use list comprehension instead of loop for glob patterns
            video_files = [f for pattern in video_patterns for f in glob.glob(pattern)]
            audio_files = [f for pattern in audio_patterns for f in glob.glob(pattern)]
            
            logging.info(f"Found video files: {video_files}")
            logging.info(f"Found audio files: {audio_files}")
            
            if video_files and audio_files:
                # Merge video and audio files
                video_file = video_files[0]  # Use first found
                audio_file = audio_files[0]  # Use first found
                
                logging.info(f"Merging {video_file} and {audio_file} into {final_path}")
                
                merge_command = [
                    ffmpeg_path,
                    '-i', video_file,
                    '-i', audio_file,
                    '-c:v', 'copy',
                    '-c:a', 'aac'
                ] + get_ffmpeg_postprocessor_args() + [
                    final_path
                ]
                
                try:
                    run_hidden_subprocess(merge_command, check=True, capture_output=True, text=True)
                    logging.info(f"Successfully merged files into: {final_path}")
                    
                    # Clean up separate files
                    try:
                        os.remove(video_file)
                        os.remove(audio_file)
                        logging.info("Cleaned up temporary separate files")
                    except Exception as e:
                        logging.warning(f"Could not clean up temporary files: {e}")
                    
                    actual_file = final_path
                    
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error merging files: {e}")
                    if e.stderr:
                        logging.error(f"FFmpeg stderr: {e.stderr}")
                    # Don't fail completely - maybe one of the files is usable
                    if os.path.exists(video_file):
                        # Use video file if it exists and seems complete
                        actual_file = video_file
                        logging.info(f"Using video file as fallback: {video_file}")
            
            # If still no file, look for any files with similar names
            if not actual_file:
                all_files = os.listdir(base_dir) if os.path.exists(base_dir) else []
                base_filename = os.path.basename(base_name)
                
                # Look for files that start with our base filename
                candidates = [f for f in all_files if f.startswith(base_filename) and f.endswith(('.mp4', '.mkv', '.webm'))]
                
                if candidates:
                    # Use the most recently modified file
                    candidates_full = [os.path.join(base_dir, f) for f in candidates]
                    candidates_full.sort(key=os.path.getmtime, reverse=True)
                    actual_file = candidates_full[0]
                    logging.info(f"Using most recent candidate file: {actual_file}")
                    
                    # Move it to the expected location if different
                    if actual_file != final_path:
                        try:
                            os.rename(actual_file, final_path)
                            actual_file = final_path
                            logging.info(f"Moved file to expected location: {final_path}")
                        except Exception as e:
                            logging.warning(f"Could not move file to expected location: {e}")

        if actual_file and os.path.exists(actual_file):
            logging.info(f"Using file: {actual_file}")
            
            # Add URL to metadata
            metadata_command = [
                ffmpeg_path,  # Use the full path here
                '-i', actual_file,
                '-metadata', f'comment={video_url}',
                '-codec', 'copy'
            ] + get_ffmpeg_postprocessor_args() + [
                f'{actual_file}_with_metadata.mp4'
            ]
            logging.info(f"Running FFmpeg command: {' '.join(metadata_command)}")

            try:
                run_hidden_subprocess(metadata_command, check=True)
                os.replace(f'{actual_file}_with_metadata.mp4', actual_file)
                
                logging.info(f"Video downloaded and processed: {actual_file}")
                socketio.emit('import_video', {'path': actual_file})
                # Emit both formats to ensure compatibility
                socketio.emit('download-complete', {'url': video_url, 'path': actual_file})  # Hyphenated format for Chrome extension
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                
                return actual_file
            except subprocess.CalledProcessError as e:
                logging.error(f"Error adding metadata: {e}")
                logging.error(f"FFmpeg stderr: {e.stderr if hasattr(e, 'stderr') else 'No stderr'}")
                # Still return the file even if metadata failed
                logging.info(f"Returning file without metadata: {actual_file}")
                socketio.emit('import_video', {'path': actual_file})
                socketio.emit('download-complete', {'url': video_url, 'path': actual_file})
                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                return actual_file
        else:
            logging.error(f"No suitable file found. Expected: {final_path}")
            # List all files in directory for debugging
            try:
                all_files = os.listdir(os.path.dirname(final_path))
                logging.error(f"Files in download directory: {all_files}")
            except Exception as e:
                logging.error(f"Could not list directory contents: {e}")
            
            raise Exception(f"Downloaded file not found at {final_path}")

    except Exception as e:
        error_message = f"Error downloading video: {str(e)}"
        logging.error(error_message)
        logging.error(f"Exception type: {type(e)}")
        logging.error(f"Exception traceback: {traceback.format_exc()}")
        
        # Check for cookie-related errors and retry without cookies
        if "invalid Netscape format cookies file" in str(e) or "CookieLoadError" in str(e) or "failed to load cookies" in str(e):
            logging.warning("Cookie format error detected. Attempting download without cookies...")
            try:
                # Retry without cookies but with comprehensive headers
                fallback_ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=None, user_agent=user_agent)
                fallback_ydl_opts.update({
                    'format': format_string,
                    'merge_output_format': 'mp4',
                    'progress_hooks': [progress_hook],
                    'postprocessor_hooks': [lambda d: socketio.emit('percentage', {'percentage': '100%'}) if d['status'] == 'finished' else None],
                    'outtmpl': {
                        'default': os.path.join(download_path, os.path.splitext(unique_filename)[0] + '.%(ext)s')
                    }
                })
                
                # No cookies or browser auth for fallback
                logging.info("Retrying download without authentication...")
                
                with yt_dlp.YoutubeDL(fallback_ydl_opts) as ydl_fallback:
                    current_download['ydl'] = ydl_fallback
                    
                    # Extract info again without cookies
                    info_fallback = ydl_fallback.extract_info(video_url, download=False)
                    if info_fallback:
                        ydl_fallback.process_ie_result(info_fallback, download=True)
                        
                        # Find the downloaded file
                        final_path = os.path.join(download_path, unique_filename)
                        
                        # Check for the actual downloaded file with various extensions
                        for ext in ['mp4', 'webm', 'mkv']:
                            test_path = os.path.splitext(final_path)[0] + '.' + ext
                            if os.path.exists(test_path):
                                logging.info(f"Found fallback downloaded file: {test_path}")
                                socketio.emit('import_video', {'path': test_path})
                                socketio.emit('download-complete', {'url': video_url, 'path': test_path})
                                logging.info("Import signal sent to Premiere Pro extension via SocketIO")
                                return test_path
                        
                        logging.warning("Fallback download completed but file not found at expected location")
                        
            except Exception as fallback_error:
                logging.error(f"Fallback download also failed: {str(fallback_error)}")
                error_message = f"Download failed with cookies, and fallback without cookies also failed: {str(fallback_error)}"
        
        # Check for Windows-specific stdout/stderr issues
        elif "[Errno 22]" in str(e) or "Invalid argument" in str(e):
            error_message = "Download failed due to Windows output stream issue. This is a known yt-dlp issue on Windows. Please try again or restart the application."
            logging.error("Windows stdout/stderr pipe error detected - recommending restart")
        
        socketio.emit('download-failed', {'message': error_message})
        return None

def download_audio(video_url, download_path, ffmpeg_path, socketio, current_download=None, settings=None, cookies=None, user_agent=None):
    check_result = check_ffmpeg(None, socketio)
    if not check_result['success']:
        return None

    try:
        # Handle cancellation
        is_cancelled = [False]
        def cancel_callback():
            is_cancelled[0] = True
            logging.info('[CANCEL] Audio download cancel callback triggered, setting is_cancelled to True')
            return is_cancelled[0]
        
        if current_download:
            current_download['cancel_callback'] = cancel_callback
            logging.info('[DOWNLOAD] Set audio cancel_callback in current_download structure')

        # Clean the URL first - remove playlist and other problematic parameters
        parsed_url = urlparse.urlparse(video_url)
        
        # Keep only essential parameters for YouTube URLs
        if 'youtube.com' in parsed_url.netloc or 'youtu.be' in parsed_url.netloc:
            query_params = urlparse.parse_qs(parsed_url.query)
            # Keep only the video ID and essential parameters
            cleaned_params = {}
            if 'v' in query_params:
                cleaned_params['v'] = query_params['v']
            elif 't' in query_params:  # Keep time parameter if present
                cleaned_params['t'] = query_params['t']
            
            # Rebuild clean URL
            clean_query = urlparse.urlencode(cleaned_params, doseq=True)
            clean_url = urlparse.urlunparse((
                parsed_url.scheme,
                parsed_url.netloc, 
                parsed_url.path,
                parsed_url.params,
                clean_query,
                parsed_url.fragment
            ))
            
            # For youtu.be URLs, extract video ID from path
            if 'youtu.be' in parsed_url.netloc and parsed_url.path:
                video_id = parsed_url.path.lstrip('/')
                clean_url = f"https://www.youtube.com/watch?v={video_id}"
            
            logging.info(f"Cleaned URL from '{video_url}' to '{clean_url}'")
            video_url = clean_url
        
        # Emit initial status
        progress_data = {
            'progress': '0',
            'percentage': '0%',
            'type': 'audio',
            'status': 'downloading'
        }
        # Emit progress to all connected clients (broadcast)
        socketio.emit('progress', {'progress': '0', 'type': 'audio'})
        socketio.emit('percentage', {'percentage': '0%'})
        
        # Check if download path exists or try to get default path
        if not download_path:
            download_path = get_default_download_path(socketio)
            if not download_path:
                error_msg = "Could not determine download path. Please open a Premiere Pro project."
                logging.error(error_msg)
                socketio.emit('download-failed', {'message': error_msg})
                return None
                
        logging.info(f"Using download path for audio: {download_path}")
        
        # Ensure the path exists
        try:
            os.makedirs(download_path, exist_ok=True)
            logging.info(f"Ensured download directory exists: {download_path}")
        except Exception as e:
            error_msg = f"Could not create download directory: {str(e)}"
            logging.error(error_msg)
            socketio.emit('download-failed', {'message': error_msg})
            return None

        # Get preferred audio language from settings
        preferred_language = 'original'
        if settings:
            preferred_language = settings.get('preferredAudioLanguage', 'original')
        logging.info(f"Using preferred audio language for audio download: {preferred_language}")
        
        # Configure format selector based on language preference
        if preferred_language != 'original':
            audio_format = f'bestaudio[language~="{preferred_language}"]/bestaudio/best'
        else:
            audio_format = 'bestaudio/best'
        
        # Progress throttling variables for audio
        last_progress_time_audio = [0]  # Use list to make it mutable in nested function
        last_progress_value_audio = [0]
        
        # Simple progress hook like the old working version
        def progress_hook(d):
            # Check for cancellation first - throw exception to stop yt-dlp
            if is_cancelled[0]:
                logging.info('[CANCEL] Audio progress hook detected cancellation, raising exception to stop yt-dlp')
                raise Exception('Download cancelled by user')
                
            if d['status'] == 'downloading':
                try:
                    percentage_str = d.get('_percent_str', '0%')
                    # Remove ANSI color codes if present
                    percentage_str = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage_str)
                    percentage_str = percentage_str.strip()
                    
                    # Extract numeric value from percentage string
                    percentage_num = 0
                    if percentage_str:
                        # Remove % and spaces, then try to parse
                        clean_str = percentage_str.replace('%', '').replace(' ', '')
                        if clean_str.isdigit():
                            percentage_num = int(clean_str)
                    
                    # Only emit if percentage increased or is 100%
                    if percentage_num > last_progress_value_audio[0] or percentage_num == 100:
                        # OPTIMIZATION: Only log key percentages to reduce I/O overhead
                        if percentage_num % 10 == 0 or percentage_num == 100:
                            logging.info(f'[PROGRESS] Audio Progress: {percentage_num}%')
                        # Emit progress to all connected clients (broadcast)
                        socketio.emit('progress', {'progress': str(percentage_num), 'type': 'audio'})
                        socketio.emit('percentage', {'percentage': percentage_str if percentage_str else f'{percentage_num}%'})
                        last_progress_value_audio[0] = percentage_num
                    # Removed debug log for skipped backward progress - reduces I/O overhead
                except Exception as e:
                    if 'cancelled' in str(e).lower():
                        raise e  # Re-raise cancellation exceptions
                    logging.error(f"Error in audio progress hook: {e}")
            elif d['status'] == 'finished':
                logging.info('[FINISHED] Audio download finished - Starting audio extraction...')
                # Emit progress to all connected clients (broadcast)
                socketio.emit('progress', {'progress': '95', 'type': 'audio', 'status': 'processing'})
                socketio.emit('percentage', {'percentage': '95% - Extracting audio...'})
                last_progress_value_audio[0] = 95

        # Prepare authentication first
        cookies_file = None
        browser_cookies = None
        
        if cookies:
            cookies_file = create_cookies_file(cookies)
            if not cookies_file:
                cookies_file = get_youtube_cookies_file()
        else:
            cookies_file = get_youtube_cookies_file()
            if not cookies_file:
                browser_cookies = try_extract_cookies_from_browser()
        
        # Configure yt-dlp options with robust settings for audio download (including auth and comprehensive headers)
        ydl_opts = get_robust_ydl_options(ffmpeg_path, cookies_file=cookies_file, user_agent=user_agent)
        ydl_opts.update({
            'format': audio_format,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'm4a',  # Use M4A (AAC) instead of WAV - much smaller and Premiere-compatible
                'preferredquality': '192',  # High quality audio
            }],
            'progress_hooks': [progress_hook],
            'writesubtitles': False,  # Don't download subtitles for audio
            'writeautomaticsub': False,  # Don't download auto subtitles
            'writedescription': False,  # Don't write description
            'writeinfojson': False,  # Don't write info JSON
            'writethumbnail': False,  # Don't download thumbnail
            'postprocessor_args': get_ffmpeg_postprocessor_args() + [
                '-metadata', f'comment={video_url}',
                '-c:a', 'aac',  # Use AAC codec
                '-b:a', '192k',  # 192kbps bitrate (high quality)
                '-threads', '2'  # Reduced threads to avoid disk saturation
            ],
        })
        
        # Add browser cookies if that's what we're using (fallback when no cookies file)
        if browser_cookies:
            ydl_opts['cookiesfrombrowser'] = browser_cookies
            logging.info("Using browser cookies for audio download")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                # Check for cancellation before starting
                if is_cancelled[0]:
                    logging.info("Audio download cancelled before starting")
                    logging.info('[CANCEL] Audio download successfully cancelled before start')
                    return None
                
                # Extract info first to verify URL is valid and get title
                logging.info(f"Attempting to extract info for URL: {video_url}")
                info = ydl.extract_info(video_url, download=False)
                
                if not info:
                    error_msg = "Could not extract video information - yt-dlp returned None"
                    logging.error(error_msg)
                    logging.error(f"URL used: {video_url}")
                    logging.error(f"yt-dlp options: {ydl_opts}")
                    raise Exception(error_msg)
                
                # Log extracted info for debugging
                logging.info(f"Successfully extracted info for: {info.get('title', 'Unknown title')}")
                logging.info(f"Video ID: {info.get('id', 'Unknown ID')}")
                logging.info(f"Duration: {info.get('duration', 'Unknown duration')} seconds")
                
                # Verify this is actually a video and not a playlist or channel
                if info.get('_type') == 'playlist':
                    error_msg = "URL points to a playlist, not a single video. Please use a direct video URL."
                    logging.error(error_msg)
                    raise Exception(error_msg)
                
                # Check if audio formats are available
                formats = info.get('formats', [])
                audio_formats = [f for f in formats if f.get('acodec') != 'none']
                if not audio_formats:
                    error_msg = "No audio formats available for this video"
                    logging.error(error_msg)
                    raise Exception(error_msg)

                # Create unique filename
                title = info.get('title', 'audio')
                sanitized_title = sanitize_youtube_title(title)
                output_path = os.path.join(download_path, f"{sanitized_title}.m4a")  # Changed to m4a

                # Ensure directory exists
                os.makedirs(download_path, exist_ok=True)

                # Remove existing temp files if any
                temp_pattern = os.path.join(download_path, f"temp_{sanitized_title}*")
                for temp_file in glob.glob(temp_pattern):
                    try:
                        os.remove(temp_file)
                    except:
                        pass

                # Set output template after getting info
                ydl_opts['outtmpl'] = os.path.join(download_path, f'temp_{sanitized_title}')
                
                # Create new YoutubeDL instance with updated options
                with yt_dlp.YoutubeDL(ydl_opts) as ydl_download:
                    if current_download:
                        current_download['ydl'] = ydl_download
                        logging.info('[DOWNLOAD] Set ydl object in current_download structure for audio download')
                    
                    # Check for cancellation before downloading
                    if is_cancelled[0]:
                        logging.info("Audio download cancelled before download")
                        logging.info('[CANCEL] Audio download successfully cancelled before download')
                        return None
                    
                    # Download using the already extracted info
                    ydl_download.process_ie_result(info, download=True)
                    
                    # IMPORTANT: Wait for post-processing to complete
                    # yt-dlp's process_ie_result is synchronous and should wait,
                    # but we add a small delay to ensure FFmpeg has written everything
                    import time
                    time.sleep(0.5)
                    
                    logging.info('[AUDIO] Post-processing completed, searching for final file...')
                    
                    # Check for cancellation after download
                    if is_cancelled[0]:
                        logging.info("Audio download cancelled after download")
                        # Remove any temp files
                        temp_pattern = os.path.join(download_path, f"temp_{sanitized_title}*")
                        for temp_file in glob.glob(temp_pattern):
                            try:
                                os.remove(temp_file)
                                logging.info(f"Removed cancelled audio file: {temp_file}")
                            except Exception as e:
                                logging.error(f"Could not remove cancelled audio file: {e}")
                        logging.info('[CANCEL] Audio download successfully cancelled after download - cleanup completed')
                        return None

                # Find the downloaded file (m4a format) - post-processing should be complete now
                downloaded_file = None
                
                # List all files to debug
                all_files = os.listdir(download_path)
                logging.info(f'[AUDIO] Files in download directory: {all_files}')
                
                # Look for the processed audio file (prioritize m4a)
                for file in all_files:
                    if file.startswith('temp_') and sanitized_title in file:
                        file_path = os.path.join(download_path, file)
                        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                        
                        if file.endswith('.m4a') and file_size > 1000:  # At least 1KB
                            downloaded_file = file_path
                            logging.info(f'[AUDIO] Found M4A file: {file} ({file_size} bytes)')
                            break
                        elif file.endswith('.wav') and file_size > 1000:
                            downloaded_file = file_path
                            logging.info(f'[AUDIO] Found WAV file: {file} ({file_size} bytes)')
                            break

                if not downloaded_file:
                    # Last resort: find ANY temp file with the title that has reasonable size
                    for file in all_files:
                        if 'temp_' in file and sanitized_title in file:
                            file_path = os.path.join(download_path, file)
                            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
                            if file_size > 1000:  # At least 1KB
                                downloaded_file = file_path
                                logging.warning(f'[AUDIO] Found fallback file: {file} ({file_size} bytes)')
                                break
                
                if not downloaded_file:
                    error_msg = f"Could not find downloaded audio file. Files in directory: {all_files}"
                    logging.error(error_msg)
                    raise Exception(error_msg)
                
                # Verify file is complete and not being written
                final_size = os.path.getsize(downloaded_file)
                logging.info(f'[AUDIO] Using downloaded file: {os.path.basename(downloaded_file)} ({final_size} bytes)')

                # Add metadata using ffmpeg (copy codec to avoid reencoding)
                temp_output = output_path + "_with_metadata.m4a"
                metadata_cmd = [
                    ffmpeg_path,
                    '-i', downloaded_file,
                    '-metadata', f'comment={video_url}',
                    '-c', 'copy',  # Copy without reencoding - much faster!
                ] + get_ffmpeg_postprocessor_args() + [
                    temp_output
                ]

                logging.info('[AUDIO] Adding metadata - fast copy mode (no reencoding)')
                run_hidden_subprocess(metadata_cmd, check=True)
                logging.info('[AUDIO] Metadata added successfully')

                # Clean up and rename
                try:
                    os.remove(downloaded_file)
                except:
                    pass

                try:
                    os.rename(temp_output, output_path)
                except:
                    # If rename fails, try copy and delete
                    import shutil
                    shutil.copy2(temp_output, output_path)
                    try:
                        os.remove(temp_output)
                    except:
                        pass

                # Clean up current_download references on success
                if current_download:
                    current_download['ydl'] = None
                    current_download['cancel_callback'] = None

                # Emit completion progress (100%)
                logging.info('[AUDIO COMPLETE] Audio extraction finished successfully')
                socketio.emit('progress', {'progress': '100', 'type': 'audio', 'status': 'complete'})
                socketio.emit('percentage', {'percentage': '100%'})

                # Emit both completion events before returning
                if socketio:
                    socketio.emit('import_video', {'path': output_path})
                    # Emit both formats to ensure compatibility
                    socketio.emit('download-complete', {'url': video_url, 'path': output_path})  # Hyphenated format for Chrome extension
                    logging.info("Import signal sent to Premiere Pro extension via SocketIO")

                return output_path

            except Exception as e:
                # Check if this is a cancellation exception
                if 'cancelled' in str(e).lower():
                    logging.info("Audio download cancelled by user")
                    # Clean up all partial files for audio downloads
                    temp_audio_path = os.path.join(download_path, f"temp_{sanitized_title}.wav")
                    cleanup_partial_video_files(temp_audio_path)
                    logging.info('[CANCEL] Audio download successfully cancelled - cleanup completed')
                    return None
                
                logging.error(f"Error downloading audio: {str(e)}")
                logging.error(f"Exception type: {type(e)}")
                logging.error(f"Exception traceback: {traceback.format_exc()}")
                if socketio:
                    socketio.emit('download-failed', {'message': f'Error downloading audio: {str(e)}'})
                return None
            finally:
                # Clean up current_download references
                if current_download:
                    current_download['ydl'] = None
                    current_download['cancel_callback'] = None
                
                # Clean up the cookies file after download (Windows only)
                if sys.platform == 'win32' and cookies_file and os.path.exists(cookies_file):
                    try:
                        os.remove(cookies_file)
                        logging.info(f"[Windows] Cleaned up temporary cookies file: {cookies_file}")
                    except Exception as e:
                        logging.debug(f"Could not remove cookies file: {e}")

    except Exception as e:
        logging.error(f"Error in download_audio: {str(e)}")
        if socketio:
            socketio.emit('download-failed', {'message': str(e)})
        return None

def format_timestamp(seconds):
    """Convert seconds to HH:MM:SS format"""
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    seconds = seconds % 60
    return f"{int(hours):02d}:{int(minutes):02d}:{int(seconds):02d}"

def get_audio_format_selector(preferred_language='original'):
    """
    Create a format selector string for yt-dlp that prefers a specific audio language
    with fallback to original audio if the preferred language is not available.
    """
    if preferred_language == 'original':
        # Return the original best format selector
        return 'bestvideo+bestaudio/best'
    
    # Language mapping for common cases
    language_codes = {
        'en': ['en', 'eng', 'english'],
        'fr': ['fr', 'fre', 'fra', 'french', 'français'],
        'es': ['es', 'spa', 'spanish', 'español'],
        'de': ['de', 'ger', 'deu', 'german', 'deutsch'],
        'it': ['it', 'ita', 'italian', 'italiano'],
        'pt': ['pt', 'por', 'portuguese', 'português'],
        'ru': ['ru', 'rus', 'russian', 'русский'],
        'ja': ['ja', 'jpn', 'japanese', '日本語'],
        'ko': ['ko', 'kor', 'korean', '한국어'],
        'zh': ['zh', 'chi', 'zho', 'chinese', '中文'],
        'ar': ['ar', 'ara', 'arabic', 'العربية'],
        'hi': ['hi', 'hin', 'hindi', 'हिन्दी']
    }
    
    # Get all possible language codes for the preferred language
    lang_variants = language_codes.get(preferred_language, [preferred_language])
    
    # Create format selector that prefers the specified language
    # Format: try language-specific audio + best video, fallback to original best
    lang_conditions = '|'.join(lang_variants)
    format_selector = f'bestvideo+bestaudio[language~="{lang_conditions}"]/bestvideo+bestaudio/best'
    
    return format_selector

def get_audio_language_options(video_url):
    """
    Extract available audio language options from a YouTube video.
    Returns a list of available languages.
    """
    try:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(video_url, download=False)
            if not info:
                return []
            
            available_languages = set()
            formats = info.get('formats', [])
            
            for fmt in formats:
                if fmt.get('acodec') != 'none':  # Audio format
                    lang = fmt.get('language')
                    if lang:
                        available_languages.add(lang)
            
            return sorted(list(available_languages))
    except Exception as e:
        logging.error(f"Error extracting audio languages: {str(e)}")
        return []

def cleanup_partial_video_files(output_path):
    """Clean up all partial files created by yt-dlp during download"""
    try:
        base_name = os.path.splitext(output_path)[0]
        base_dir = os.path.dirname(output_path)
        
        if not os.path.exists(base_dir):
            return
        
        # Patterns for yt-dlp partial files
        patterns = [
            f"{base_name}.f*.mp4",      # Video streams (f137.mp4, etc.)
            f"{base_name}.f*.m4a",      # Audio streams (f140.m4a, etc.)
            f"{base_name}.f*.webm",     # WebM video/audio
            f"{base_name}.f*.mkv",      # MKV containers
            f"{base_name}.part",        # Partial download files
            f"{base_name}.ytdl",        # yt-dlp temporary files
            f"{base_name}*.part",       # More partial patterns
            output_path,                # Final output file if it exists
        ]
        
        # OPTIMIZATION: Use list comprehension to gather all files at once
        matching_files = [f for pattern in patterns for f in glob.glob(pattern)]
        removed_files = []
        
        for file_path in matching_files:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    removed_files.append(os.path.basename(file_path))
                    logging.info(f"Removed partial file: {file_path}")
            except Exception as e:
                logging.error(f"Could not remove partial file {file_path}: {e}")
        
        if removed_files:
            logging.info(f"Cleaned up {len(removed_files)} partial files: {', '.join(removed_files)}")
        else:
            logging.info("No partial files found to clean up")
            
    except Exception as e:
        logging.error(f"Error during partial file cleanup: {e}")

def write_error_log(error_message, context=None):
    """Write error to dedicated error log file"""
    try:
        log_dir = os.environ.get('YTPP_LOG_DIR')
        if not log_dir:
            return
        
        error_log_path = os.path.join(log_dir, 'video_processing_errors.log')
        
        from datetime import datetime
        timestamp = datetime.now().isoformat()
        
        with open(error_log_path, 'a', encoding='utf-8') as f:
            f.write(f"\n[{timestamp}] ERROR: {error_message}\n")
            if context:
                f.write(f"Context: {json.dumps(context, indent=2)}\n")
            f.write("-" * 50 + "\n")
    except Exception as e:
        logging.error(f"Failed to write to error log: {e}")

def get_ffmpeg_location_for_ydl(ffmpeg_path):
    """Get the correct FFmpeg location configuration for yt-dlp"""
    if not ffmpeg_path:
        return None
    
    if sys.platform == 'win32':
        # On Windows, yt-dlp expects the full path to the executable
        return ffmpeg_path
    else:
        # On Unix systems (macOS/Linux)
        if ffmpeg_path == 'ffmpeg':
            # If it's just 'ffmpeg', it's in PATH - don't set ffmpeg_location
            # yt-dlp will find it automatically
            return None
        elif os.path.isabs(ffmpeg_path):
            # If it's an absolute path, return the directory containing it
            ffmpeg_dir = os.path.dirname(ffmpeg_path)
            if ffmpeg_dir and ffmpeg_dir != '/' and ffmpeg_dir != '.':
                return ffmpeg_dir
            else:
                return None
        else:
            # Relative path - return as-is and let yt-dlp handle it
            return ffmpeg_path

def get_robust_ydl_options(ffmpeg_path, cookies_file=None, user_agent=None):
    """Get robust yt-dlp options to handle YouTube changes and SABR streaming"""
    import sys
    import os
    
    # Configure stdout/stderr redirection for Windows to prevent BrokenPipeError
    redirect_output = sys.platform == 'win32'
    
    base_options = {
        'quiet': redirect_output,  # Suppress stdout/stderr on Windows to prevent BrokenPipeError
        'no_warnings': redirect_output,  # Suppress warnings on Windows
        'age_limit': None,  # Don't apply age limits
        'geo_bypass': True,  # Bypass geographic restrictions
        'geo_bypass_country': 'US',  # Use US as bypass country
        'nocheckcertificate': True,  # Skip certificate validation
        'extractor_retries': 10,  # Increase retry count
        'retry_sleep': lambda n: min(5 * (n + 1), 30),  # Exponential backoff with max 30s
        'socket_timeout': 60,  # Increase socket timeout
        'fragment_retries': 10,  # Retry fragment downloads
        'file_access_retries': 5,  # Retry file access operations
        'ignoreerrors': False,  # Don't ignore errors during extraction
        'extract_flat': False,  # Don't use flat extraction
        'playlistend': 1,  # Only download first video if URL is accidentally a playlist
        'playliststart': 1,  # Start from first video
        'noplaylist': True,  # Explicitly ignore playlists
        
        # Progress tracking improvements (console output disabled on Windows)
        'consoletitle': not redirect_output,  # Disable console title updates on Windows
        'noprogress': redirect_output,  # Disable progress output to stdout/stderr on Windows
        'progress_with_newline': False,  # Use same line for progress when enabled
        
        # YouTube-specific options to handle SABR and signature issues
        'youtube_include_dash_manifest': True,  # Include DASH manifest
        'youtube_include_hls_manifest': True,   # Include HLS manifest
        'youtube_skip_dash_manifest': False,    # Don't skip DASH manifest
        'youtube_skip_hls_manifest': False,     # Don't skip HLS manifest
        # Let yt-dlp use its default player client logic - works better with YouTube's anti-bot measures
        
        # Additional options to bypass bot detection
        'source_address': '0.0.0.0',  # Bind to IPv4
        'force_generic_extractor': False,  # Use YouTube extractor
        
        # FFmpeg configuration - handle both absolute paths and PATH resolution
        'ffmpeg_location': get_ffmpeg_location_for_ydl(ffmpeg_path),
        'postprocessor_args': get_ffmpeg_postprocessor_args() + ['-threads', '4'],
        'external_downloader_args': ['-timeout', '120'],  # Increase timeout
    }
    
    # Add Windows-specific stdout/stderr redirection to prevent BrokenPipeError
    if redirect_output:
        # Redirect stdout/stderr to null to prevent pipe errors on Windows
        base_options['logger'] = None  # Disable default logger
        # Note: Progress hooks will still work as they're called directly by yt-dlp
        logging.info("Windows detected: Configured yt-dlp to suppress stdout/stderr output to prevent BrokenPipeError")
    
    # Add authentication if available
    if cookies_file:
        base_options['cookiefile'] = cookies_file
        logging.info(f"Using cookies file: {cookies_file}")
    
    # Add comprehensive browser headers to avoid 403 errors
    http_headers = {}
    
    if user_agent:
        http_headers['User-Agent'] = user_agent
    else:
        # Use a modern Chrome user agent as fallback
        http_headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    
    # Add essential browser headers - keep it minimal to avoid conflicts
    http_headers.update({
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
    })
    
    base_options['http_headers'] = http_headers
    logging.info(f"Using comprehensive browser headers with User-Agent: {http_headers.get('User-Agent', 'default')[:50]}...")
    
    # Configure external JavaScript runtime (Deno) for YouTube support
    # Required for yt-dlp 2025.11.12+ to fully support YouTube downloads
    # Deno is enabled by default in yt-dlp, so we just verify it's available
    # IMPORTANT: Do NOT specify player_client in extractor_args - it severely limits format availability!
    # yt-dlp's default logic works best with Deno/EJS
    try:
        # Check if Deno is available in PATH
        import shutil
        deno_path = shutil.which('deno')
        if deno_path:
            logging.info(f"[OK] Deno runtime found at: {deno_path}")
            logging.info("[OK] External JavaScript runtime enabled (EJS challenge solver should be pre-downloaded)")
            logging.info("[OK] Using yt-dlp's default player client logic for maximum format availability")
        else:
            logging.warning("[WARNING] Deno runtime not found in PATH. YouTube format availability may be limited.")
            logging.warning("  Install Deno with: .\\scripts\\install-deno.ps1")
            logging.warning("  Then restart the application or run: .\\scripts\\add-deno-to-path.ps1")
    except Exception as e:
        logging.warning(f"Error checking for Deno runtime: {e}")
    
    logging.info("YT-DLP options configured for robust YouTube downloading with EJS support")
    
    return base_options

def get_fallback_format_options(max_height):
    """Get fallback format options that are more likely to work with current YouTube"""
    # Start with the most compatible formats that work with SABR streaming
    format_options = [
        # Try mobile/TV formats first (often work better with SABR)
        f'best[height<={max_height}][protocol^=https]',  # HTTPS only
        f'best[height<={max_height}][protocol!=http_dash_segments]',  # Avoid problematic DASH
        f'bestvideo[height<={max_height}][protocol^=https]+bestaudio[protocol^=https]',
        f'bestvideo[height<={max_height}]+bestaudio',
        
        # Fallback to any working format
        f'best[height<={max_height}]',
        'best[protocol^=https]',  # Any HTTPS format
        'best[protocol!=http_dash_segments]',  # Avoid problematic protocols
        'best',  # Last resort - any format
        
        # Emergency fallbacks
        'worst[height>=360]',  # At least 360p
        'worst',  # Absolute last resort
    ]
    
    return format_options

def log_download_context(error, context_info):
    """Log detailed context information when download errors occur"""
    try:
        import traceback
        import sys
        
        error_details = {
            'error_type': type(error).__name__,
            'error_message': str(error),
            'platform': sys.platform,
            'context': context_info,
            'timestamp': time.time()
        }
        
        logging.error(f"Download error context: {json.dumps(error_details, indent=2)}")
        
        # Check for specific Windows errors
        if sys.platform == 'win32':
            if 'BrokenPipeError' in str(type(error)):
                logging.error("Windows BrokenPipeError detected - this is typically caused by stdout/stderr pipe issues")
                logging.error("Solution: yt-dlp output has been suppressed to prevent this error")
            elif '[Errno 32]' in str(error):
                logging.error("Windows pipe error detected - output streams have been redirected")
        
        # Log the full traceback for debugging
        logging.error(f"Full traceback:\n{traceback.format_exc()}")
        
    except Exception as log_error:
        logging.error(f"Error while logging download context: {str(log_error)}")

# Main execution
if __name__ == "__main__":
    # Add any additional setup if necessary
    import time
    import json
    logging.basicConfig(level=logging.INFO)
    logging.info("Script started")
