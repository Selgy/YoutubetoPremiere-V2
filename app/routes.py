from flask import request, jsonify, send_file
import logging
import json
from video_processing import handle_video_url, get_audio_language_options
from utils import play_notification_sound, save_license_key, get_license_key, load_settings, save_settings, save_download_path, open_sounds_folder
import os
import sys
import requests
import socket
import platform
import re
import tempfile
import subprocess
import time

def register_routes(app, socketio, settings):
    connected_clients = set()
    current_download = {'process': None, 'ydl': None, 'cancel_callback': None}
    
    # Store pending import triggers for HTTP fallback polling
    pending_import_triggers = []
    
    def validate_youtube_url(url):
        """Validate that the URL is from a YouTube domain"""
        if not url:
            return False
            
        youtube_domains = [
            'youtube.com', 
            'youtu.be', 
            'www.youtube.com', 
            'm.youtube.com',
            'youtube-nocookie.com', 
            'www.youtube-nocookie.com'
        ]
        
        try:
            # Simple regex to extract domain
            import re
            domain_match = re.search(r'https?://([^/]+)', url)
            if domain_match:
                domain = domain_match.group(1)
                return any(domain.endswith(yt_domain) for yt_domain in youtube_domains)
        except:
            pass
            
        return False

    @socketio.on('connect')
    def handle_connect():
        client_id = request.sid
        connected_clients.add(client_id)
        logging.info(f'Client connected to route handler')
        socketio.emit('connection_status', {'status': 'connected'}, room=client_id)

    @socketio.on('disconnect')
    def handle_route_disconnect(sid=None):
        client_id = request.sid
        if client_id in connected_clients:
            connected_clients.remove(client_id)
        logging.info(f'Client disconnected from route handler')

    @app.route('/')
    def root():
        return "Premiere is alive", 200
    
    @app.route('/health')
    def health_check():
        return jsonify({'status': 'ok'}), 200

    @app.route('/get-version', methods=['GET'])
    def get_version():
        return jsonify(version='3.0.12')

    @app.route('/check-updates', methods=['GET'])
    def check_updates():
        """Check for available updates from GitHub releases"""
        try:
            # Current version
            current_version = '3.0.12'
            
            # Detect OS
            system = platform.system().lower()
            machine = platform.machine().lower()
            
            # Determine OS type for download links
            if system == 'darwin':
                if 'arm' in machine or 'aarch64' in machine:
                    os_type = 'mac_arm64'
                else:
                    os_type = 'mac_intel'
            elif system == 'windows':
                os_type = 'windows'
            else:
                os_type = 'unknown'
            
            # Check GitHub releases API
            github_api_url = 'https://api.github.com/repos/Selgy/YoutubetoPremiere-V2/releases/latest'
            
            try:
                response = requests.get(github_api_url, timeout=10)
                logging.info(f"GitHub API response status: {response.status_code}")
                
                if response.status_code == 200:
                    release_data = response.json()
                    latest_version = release_data.get('tag_name', '').lstrip('v')
                    release_notes = release_data.get('body', '')
                    release_date = release_data.get('published_at', '')
                    
                    # Compare versions
                    def version_tuple(v):
                        return tuple(map(int, (v.split("."))))
                    
                    is_newer = False
                    try:
                        is_newer = version_tuple(latest_version) > version_tuple(current_version)
                    except:
                        is_newer = latest_version != current_version
                    
                    # Extract actual download URLs from GitHub release assets
                    download_urls = {}
                    assets = release_data.get('assets', [])
                    
                    for asset in assets:
                        asset_name = asset.get('name', '')
                        browser_download_url = asset.get('browser_download_url', '')
                        
                        if 'Windows' in asset_name and asset_name.endswith('.exe'):
                            download_urls['windows'] = browser_download_url
                        elif 'macOS' in asset_name and asset_name.endswith('.pkg'):
                            # For now, use the same file for both Intel and ARM Macs
                            download_urls['mac_arm64'] = browser_download_url
                            download_urls['mac_intel'] = browser_download_url
                    
                    # Get the appropriate download URL for current OS
                    download_url = download_urls.get(os_type)
                    
                    # Fallback: if no assets found, construct URLs from expected naming pattern
                    if not download_urls:
                        base_url = f"https://github.com/Selgy/YoutubetoPremiere-V2/releases/download/v{latest_version}"
                        download_urls['windows'] = f"{base_url}/YouTubetoPremiere-Windows.exe"
                        download_urls['mac_arm64'] = f"{base_url}/YouTubetoPremiere-macOS.pkg"
                        download_urls['mac_intel'] = f"{base_url}/YouTubetoPremiere-macOS.pkg"
                        download_url = download_urls.get(os_type)
                    
                    return jsonify({
                        'current_version': current_version,
                        'latest_version': latest_version,
                        'has_update': is_newer,
                        'os_type': os_type,
                        'download_url': download_url,
                        'all_download_urls': download_urls,
                        'release_notes': release_notes,
                        'release_date': release_date,
                        'success': True
                    })
                elif response.status_code == 404:
                    # Repository not found or not public
                    return jsonify({
                        'current_version': current_version,
                        'latest_version': current_version,
                        'has_update': False,
                        'os_type': os_type,
                        'success': True,
                        'message': 'Repository not found. You have the latest available version.'
                    })
                else:
                    return jsonify({
                        'current_version': current_version,
                        'success': False,
                        'error': f'GitHub API returned status {response.status_code}'
                    })
                    
            except requests.RequestException as e:
                logging.error(f"Network error checking updates: {e}")
                return jsonify({
                    'current_version': current_version,
                    'latest_version': current_version,
                    'has_update': False,
                    'os_type': os_type,
                    'success': True,
                    'message': 'Unable to check for updates. You may be offline or GitHub is unavailable.'
                })
                
        except Exception as e:
            logging.error(f"Error checking updates: {e}")
            return jsonify({
                'current_version': current_version,
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/settings', methods=['GET', 'POST'])
    def handle_settings():
        if request.method == 'GET':
            try:
                current_settings = load_settings()
                settings_to_send = current_settings.copy()
                settings_to_send.pop('SETTINGS_FILE', None)
                settings_to_send.pop('ffmpeg_path', None)
                settings_to_send.pop('ffmpeg_error', None)
                return jsonify(settings_to_send), 200
            except Exception as e:
                logging.error(f"Error reading settings: {e}")
                return jsonify(error=str(e)), 500
        else:  # POST
            try:
                new_settings = request.get_json()
                settings.update(new_settings)
                if save_settings(settings):
                    return jsonify(success=True), 200
                else:
                    return jsonify(success=False, error="Failed to save settings"), 500
            except Exception as e:
                logging.error(f"Error saving settings: {e}")
                return jsonify(success=False, error=str(e)), 500

    @app.route('/handle-video-url', methods=['POST'])
    def handle_video_url_route():
        try:
            # Debug: Log raw request data
            logging.info(f"Raw request content type: {request.content_type}")
            logging.info(f"Raw request data length: {len(request.data) if request.data else 0}")
            
            data = request.json
            if data is None:
                logging.error("No JSON data received in request")
                return jsonify({'error': 'No JSON data received'}), 400
                
            logging.info(f"Received data keys: {list(data.keys())}")
            
            video_url = data.get('url')
            download_type = data.get('type', 'video')
            cookies = data.get('cookies', [])
            user_agent = data.get('userAgent', '')
            
            # Debug: Log cookies information  
            logging.info(f"Received cookies: {len(cookies)} cookies")
            if cookies:
                logging.info(f"First few cookies: {[{'name': c.get('name'), 'domain': c.get('domain')} for c in cookies[:3]]}")
                # Log total cookies size
                cookies_size = len(str(cookies))
                logging.info(f"Total cookies data size: {cookies_size} bytes")
            if user_agent:
                logging.info(f"User-Agent: {user_agent[:50]}...")
            
            logging.info(f"Video URL: {video_url}")
            logging.info(f"Download type: {download_type}")
            
            if not video_url:
                return jsonify({'error': 'No URL provided'}), 400
                
            # Validate the URL is from YouTube
            if not validate_youtube_url(video_url):
                return jsonify({'error': 'Invalid YouTube URL'}), 400
            
            # Load current settings
            current_settings = load_settings()
            logging.info(f"Current settings for download: {current_settings}")
            
            # Emit start event to all connected clients
            socketio.emit('download_started', {'url': video_url})
            
            # Check for clip parameters regardless of passed download_type
            current_time = data.get('currentTime')
            
            # If currentTime is provided, treat as clip download
            if current_time is not None:
                # Ensure download_type is set to 'clip'
                download_type = 'clip'
                logging.info(f"Handling as clip download for time: {current_time}")
                
                # Convert to float and use settings for before/after times
                current_time = float(current_time)
                seconds_before = float(current_settings.get('secondsBefore', 15))
                seconds_after = float(current_settings.get('secondsAfter', 15))
                
                # Calculate clip start and end times
                clip_start = max(0, current_time - seconds_before)
                clip_end = current_time + seconds_after
                
                logging.info(f"Clip parameters: start={clip_start}, end={clip_end}, duration={clip_end-clip_start}")
                
                # Process the video with clip parameters
                result = handle_video_url(
                    video_url=video_url, 
                    download_type='clip',  # Explicit clip type
                    current_download=current_download, 
                    socketio=socketio,
                    clip_start=clip_start,
                    clip_end=clip_end,
                    settings=current_settings,
                    cookies=cookies,
                    user_agent=user_agent
                )
            else:
                # No clip parameters, process as regular video
                logging.info(f"Handling as regular {download_type} download")
                result = handle_video_url(
                    video_url=video_url, 
                    download_type=download_type, 
                    current_download=current_download, 
                    socketio=socketio,
                    settings=current_settings,
                    cookies=cookies,
                    user_agent=user_agent
                )
            
            if 'error' in result:
                return jsonify({'error': result['error']}), 400
                
            return jsonify({'success': True}), 200
        except Exception as e:
            error_message = f"Error handling video URL: {str(e)}"
            logging.error(error_message)
            return jsonify({'error': error_message}), 500

    @app.route('/update-sound-settings', methods=['POST'])
    def update_sound_settings():
        try:
            data = request.get_json()
            volume = data.get('volume', 30)
            sound_type = data.get('sound', 'default')
            
            # Save to settings file
            with open(settings['SETTINGS_FILE'], 'r') as f:
                current_settings = json.load(f)
            
            current_settings['notificationVolume'] = volume
            current_settings['notificationSound'] = sound_type
            
            with open(settings['SETTINGS_FILE'], 'w') as f:
                json.dump(current_settings, f, indent=4)
                
            # Update in-memory settings
            settings['notificationVolume'] = volume
            settings['notificationSound'] = sound_type
            
            return jsonify(success=True), 200
        except Exception as e:
            logging.error(f"Error updating sound settings: {e}")
            return jsonify(success=False, error=str(e)), 500

    @app.route('/test-sound', methods=['POST'])
    def test_sound():
        try:
            data = request.get_json()
            volume = data.get('volume', 30) / 100  # Convert to 0-1 range
            sound_type = data.get('sound', 'default')
            
            play_notification_sound(volume=volume, sound_type=sound_type)
            return jsonify(success=True), 200
        except Exception as e:
            logging.error(f"Error playing test sound: {e}")
            return jsonify(success=False, error=str(e)), 500

    @app.route('/available-sounds', methods=['GET'])
    def get_available_sounds():
        try:
            if getattr(sys, 'frozen', False):
                base_path = os.path.dirname(sys.executable)
            else:
                base_path = os.path.dirname(os.path.abspath(__file__))
            
            sound_dirs = [
                os.path.join(base_path, 'sounds'),
                os.path.join(os.path.dirname(base_path), 'sounds'),
                os.path.join(base_path, 'app', 'sounds'),
                os.path.join(base_path, 'exec', 'sounds'),
                os.path.join(os.path.dirname(base_path), 'app', 'sounds')
            ]
            
            for dir_path in sound_dirs:
                if os.path.exists(dir_path):
                    sound_files = [os.path.splitext(f)[0] for f in os.listdir(dir_path) 
                                 if f.lower().endswith(('.mp3', '.wav'))]
                    return jsonify(sounds=sound_files)
            
            return jsonify(sounds=[])
        except Exception as e:
            logging.error(f"Error getting available sounds: {e}")
            return jsonify(sounds=[])

    @app.route('/validate-license', methods=['POST'])
    def validate_license():
        try:
            data = request.get_json()
            license_key = data.get('licenseKey')
            
            if not license_key:
                return jsonify({'success': False, 'message': 'No license key provided'}), 400

            # Try Gumroad validation
            gumroad_response = requests.post('https://api.gumroad.com/v2/licenses/verify', {
                'product_id': '9yYJT15dJO3wB4Z74N-EUg==',
                'license_key': license_key
            })

            if gumroad_response.ok and gumroad_response.json().get('success'):
                save_license_key(license_key)
                return jsonify({'success': True, 'message': 'License validated successfully'})

            # Try Shopify validation
            api_token = 'eHyU10yFizUV5qUJaFS8koE1nIx2UCDFNSoPVdDRJDI7xtunUK6ZWe40vfwp'
            shopify_response = requests.post(
                f'https://app-easy-product-downloads.fr/api/get-license-key',
                params={'license_key': license_key, 'api_token': api_token}
            )

            if shopify_response.ok and shopify_response.json().get('status') == 'success':
                save_license_key(license_key)
                return jsonify({'success': True, 'message': 'License validated successfully'})

            return jsonify({'success': False, 'message': 'Invalid license key'}), 400

        except Exception as e:
            logging.error(f'Error validating license: {e}')
            return jsonify({'success': False, 'message': str(e)}), 500

    @app.route('/check-license', methods=['GET'])
    def check_license():
        try:
            license_key = get_license_key()
            if not license_key:
                return jsonify({'isValid': False, 'message': 'No license key found'})

            # Perform the same validation as above
            gumroad_response = requests.post('https://api.gumroad.com/v2/licenses/verify', {
                'product_id': '9yYJT15dJO3wB4Z74N-EUg==',
                'license_key': license_key
            })

            if gumroad_response.ok and gumroad_response.json().get('success'):
                return jsonify({'isValid': True, 'message': 'License is valid'})

            api_token = 'eHyU10yFizUV5qUJaFS8koE1nIx2UCDFNSoPVdDRJDI7xtunUK6ZWe40vfwp'
            shopify_response = requests.post(
                f'https://app-easy-product-downloads.fr/api/get-license-key',
                params={'license_key': license_key, 'api_token': api_token}
            )

            if shopify_response.ok and shopify_response.json().get('status') == 'success':
                return jsonify({'isValid': True, 'message': 'License is valid'})

            return jsonify({'isValid': False, 'message': 'Invalid license key'})

        except Exception as e:
            logging.error(f'Error checking license: {e}')
            return jsonify({'isValid': False, 'message': str(e)})

    @app.route('/get-ip', methods=['GET'])
    def get_ip():
        try:
            # Always prioritize localhost for local development and CEP extensions
            preferred_ips = ['localhost', '127.0.0.1']
            external_ips = []
            
            # Try to get all possible IP addresses
            hostname = socket.gethostname()
            
            # Get all network interfaces
            try:
                for interface in socket.getaddrinfo(hostname, None):
                    ip = interface[4][0]
                    # Only include IPv4 addresses
                    if '.' in ip and ip not in preferred_ips:
                        external_ips.append(ip)
            except Exception as e:
                logging.warning(f"Could not enumerate network interfaces: {e}")
            
            # Build complete IP list: prioritize localhost, then external IPs
            all_ips = preferred_ips + external_ips
            
            # For CEP extensions, always return localhost as the primary IP
            # since the Chrome extension and Python server run on the same machine
            primary_ip = 'localhost'
            
            logging.info(f'Returning localhost as primary IP for CEP compatibility')
            logging.info(f'Available IPs: {all_ips}')
            
            return jsonify({
                'ip': primary_ip,
                'ips': all_ips,
                'hostname': hostname
            })
            
        except Exception as e:
            logging.error(f'Error getting IP address: {e}')
            return jsonify({
                'ip': 'localhost', 
                'ips': ['localhost', '127.0.0.1'],
                'error': str(e)
            })

    @app.route('/get-audio-languages', methods=['POST'])
    def get_audio_languages():
        try:
            data = request.get_json()
            video_url = data.get('url')
            
            if not video_url:
                return jsonify({'error': 'No URL provided'}), 400
                
            # Validate the URL is from YouTube
            if not validate_youtube_url(video_url):
                return jsonify({'error': 'Invalid YouTube URL'}), 400
            
            # Get available audio languages for this video
            languages = get_audio_language_options(video_url)
            return jsonify({'languages': languages}), 200
            
        except Exception as e:
            logging.error(f"Error getting audio languages: {e}")
            return jsonify({'error': str(e)}), 500

    # HTTP fallback routes removed - using WebSocket only communication

    # Process the request to get a download folder
    @socketio.on('project_path_response')
    def handle_project_path_response(data):
        try:
            project_path = data.get('path')
            if project_path:
                logging.info(f"Received project path from Premiere: {project_path}")
                
                # Create a download folder next to the project
                download_path = os.path.join(os.path.dirname(project_path), 'YoutubeToPremiere_download')
                try:
                    os.makedirs(download_path, exist_ok=True)
                    logging.info(f"Created download folder: {download_path}")
                    # Store the path in settings for future use
                    save_download_path(download_path)
                    return {'success': True, 'path': download_path}
                except Exception as e:
                    logging.error(f"Error creating download folder: {str(e)}")
                    return {'error': f"Could not create download folder: {str(e)}"}
            else:
                logging.warning("Received empty project path from Premiere")
                return {'error': 'Empty project path received'}
        except Exception as e:
            logging.error(f"Error handling project path response: {str(e)}")
            return {'error': str(e)}

    @app.route('/open-logs-folder', methods=['POST'])
    def open_logs_folder():
        """Open the logs folder in the system file explorer"""
        try:
            # Get log directory from environment
            log_dir = os.environ.get('YTPP_LOG_DIR')
            if not log_dir or not os.path.exists(log_dir):
                return jsonify({
                    'success': False,
                    'error': 'Log directory not found'
                }), 404
            
            logging.info(f"Opening logs folder: {log_dir}")
            
            # Determine the command based on the operating system
            system = platform.system().lower()
            success = False
            error_messages = []
            
            if system == 'windows':
                # Windows: try multiple methods
                try:
                    # Method 1: Use os.startfile (most reliable on Windows)
                    os.startfile(log_dir)
                    success = True
                    logging.info("Successfully opened logs folder using os.startfile")
                except Exception as e:
                    error_messages.append(f"os.startfile failed: {str(e)}")
                    try:
                        # Method 2: Use explorer with /select flag (more reliable)
                        # Create a dummy file path to select in the directory
                        dummy_file = os.path.join(log_dir, "YoutubetoPremiere.log")
                        if os.path.exists(dummy_file):
                            subprocess.run(['explorer', '/select,', dummy_file], check=True)
                        else:
                            subprocess.run(['explorer', '/root,', log_dir], check=True)
                        success = True
                        logging.info("Successfully opened logs folder using explorer /select")
                    except Exception as e2:
                        error_messages.append(f"explorer /select failed: {str(e2)}")
                        try:
                            # Method 3: Use cmd to open explorer
                            subprocess.run(['cmd', '/c', 'start', '', log_dir], check=True)
                            success = True
                            logging.info("Successfully opened logs folder using cmd start")
                        except Exception as e3:
                            error_messages.append(f"cmd start failed: {str(e3)}")
                            
            elif system == 'darwin':
                # macOS: use open
                try:
                    subprocess.run(['open', log_dir], check=True)
                    success = True
                    logging.info("Successfully opened logs folder using open command")
                except Exception as e:
                    error_messages.append(f"open command failed: {str(e)}")
                    
            elif system == 'linux':
                # Linux: try common file managers
                file_managers = ['xdg-open', 'nautilus', 'dolphin', 'thunar', 'pcmanfm']
                for fm in file_managers:
                    try:
                        subprocess.run([fm, log_dir], check=True)
                        success = True
                        logging.info(f"Successfully opened logs folder using {fm}")
                        break
                    except Exception as e:
                        error_messages.append(f"{fm} failed: {str(e)}")
                        continue
            else:
                return jsonify({
                    'success': False,
                    'error': f'Unsupported operating system: {system}'
                }), 500
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Logs folder opened successfully',
                    'path': log_dir
                })
            else:
                error_msg = f"All methods failed to open logs folder. Errors: {'; '.join(error_messages)}"
                logging.error(error_msg)
                return jsonify({
                    'success': False,
                    'error': error_msg
                }), 500
            
        except Exception as e:
            error_msg = f"Error opening logs folder: {str(e)}"
            logging.error(error_msg)
            return jsonify({
                'success': False,
                'error': error_msg
            }), 500

    @app.route('/open-sounds-folder', methods=['POST'])
    def open_sounds_folder_route():
        """Open the sounds folder in the system file explorer"""
        try:
            logging.info("Opening sounds folder...")
            
            # Call the utility function to open the sounds folder
            sounds_dir = open_sounds_folder()
            
            return jsonify({
                'success': True,
                'message': 'Sounds folder opened successfully',
                'path': sounds_dir
            })
            
        except Exception as e:
            error_msg = f"Error opening sounds folder: {str(e)}"
            logging.error(error_msg)
            return jsonify({
                'success': False,
                'error': error_msg
            }), 500

    @app.route('/set-youtube-cookies', methods=['POST'])
    def set_youtube_cookies():
        """Store YouTube cookies for authentication"""
        try:
            data = request.get_json()
            cookies = data.get('cookies', [])
            
            if not cookies:
                return jsonify({
                    'success': False,
                    'error': 'No cookies provided'
                }), 400
            
            # Store cookies in a temporary file for yt-dlp to use
            cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
            os.makedirs(cookies_dir, exist_ok=True)
            cookies_file = os.path.join(cookies_dir, 'youtube_cookies.txt')
            
            # Convert Chrome cookies to Netscape format for yt-dlp
            with open(cookies_file, 'w', encoding='utf-8') as f:
                f.write("# Netscape HTTP Cookie File\n")
                f.write("# This is a generated file! Do not edit.\n\n")
                
                for cookie in cookies:
                    # Convert Chrome cookie format to Netscape format
                    domain = cookie.get('domain', '')
                    flag = 'TRUE' if domain.startswith('.') else 'FALSE'
                    path = cookie.get('path', '/')
                    secure = 'TRUE' if cookie.get('secure', False) else 'FALSE'
                    expiration = str(int(cookie.get('expirationDate', 0)))
                    name = cookie.get('name', '')
                    value = cookie.get('value', '')
                    
                    # Write in Netscape format: domain flag path secure expiration name value
                    f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{expiration}\t{name}\t{value}\n")
            
            logging.info(f"Stored {len(cookies)} YouTube cookies to {cookies_file}")
            
            # Update settings to mark cookies as connected
            current_settings = load_settings()
            current_settings['youtubeCookiesStatus'] = 'connected'
            save_settings(current_settings)
            
            return jsonify({
                'success': True,
                'message': f'Successfully stored {len(cookies)} cookies',
                'cookies_file': cookies_file
            })
            
        except Exception as e:
            error_msg = f"Error storing YouTube cookies: {str(e)}"
            logging.error(error_msg)
            return jsonify({
                'success': False,
                'error': error_msg
            }), 500

    @app.route('/clear-youtube-cookies', methods=['POST'])
    def clear_youtube_cookies():
        """Clear stored YouTube cookies"""
        try:
            cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
            cookies_file = os.path.join(cookies_dir, 'youtube_cookies.txt')
            
            if os.path.exists(cookies_file):
                os.remove(cookies_file)
                logging.info("Cleared YouTube cookies file")
            
            # Update settings to mark cookies as not connected
            current_settings = load_settings()
            current_settings['youtubeCookiesStatus'] = 'not_connected'
            save_settings(current_settings)
            
            return jsonify({
                'success': True,
                'message': 'YouTube cookies cleared successfully'
            })
            
        except Exception as e:
            error_msg = f"Error clearing YouTube cookies: {str(e)}"
            logging.error(error_msg)
            return jsonify({
                'success': False,
                'error': error_msg
            }), 500

    @app.route('/get-youtube-cookies-status', methods=['GET'])
    def get_youtube_cookies_status():
        """Get the current status of YouTube cookies"""
        try:
            cookies_dir = os.path.join(os.environ.get('TEMP', tempfile.gettempdir()), 'YoutubetoPremiere')
            cookies_file = os.path.join(cookies_dir, 'youtube_cookies.txt')
            
            has_cookies = os.path.exists(cookies_file) and os.path.getsize(cookies_file) > 0
            
            current_settings = load_settings()
            status = current_settings.get('youtubeCookiesStatus', 'not_connected')
            
            # Verify status matches file existence
            if has_cookies and status == 'not_connected':
                status = 'connected'
                current_settings['youtubeCookiesStatus'] = 'connected'
                save_settings(current_settings)
            elif not has_cookies and status == 'connected':
                status = 'not_connected'
                current_settings['youtubeCookiesStatus'] = 'not_connected'
                save_settings(current_settings)
            
            return jsonify({
                'status': status,
                'has_cookies_file': has_cookies,
                'cookies_file': cookies_file if has_cookies else None
            })
            
        except Exception as e:
            error_msg = f"Error getting YouTube cookies status: {str(e)}"
            logging.error(error_msg)
            return jsonify({
                'status': 'error',
                'error': error_msg
            }), 500

    @app.route('/network-test', methods=['GET'])
    def network_test():
        """Test network configuration and provide diagnostics"""
        import time
        import socket
        from utils import diagnose_windows_networking
        
        try:
            start_time = time.time()
            diagnostics = {
                'timestamp': start_time,
                'tests': []
            }
            
            # Test 1: Local socket binding
            try:
                test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                test_socket.bind(('localhost', 0))  # Bind to any available port
                test_port = test_socket.getsockname()[1]
                test_socket.close()
                
                diagnostics['tests'].append({
                    'name': 'Socket Binding',
                    'status': 'pass',
                    'message': f'Successfully bound to localhost:{test_port}',
                    'duration_ms': (time.time() - start_time) * 1000
                })
            except Exception as e:
                diagnostics['tests'].append({
                    'name': 'Socket Binding',
                    'status': 'fail',
                    'message': f'Failed to bind socket: {str(e)}',
                    'duration_ms': (time.time() - start_time) * 1000
                })
            
            # Test 2: Windows-specific networking diagnostics
            if platform.system() == 'Windows':
                win_diag_start = time.time()
                try:
                    win_diagnostics = diagnose_windows_networking()
                    diagnostics['tests'].append({
                        'name': 'Windows Network Diagnostics',
                        'status': 'pass' if win_diagnostics.get('success') else 'fail',
                        'message': 'Windows networking diagnostics completed',
                        'details': win_diagnostics,
                        'duration_ms': (time.time() - win_diag_start) * 1000
                    })
                except Exception as e:
                    diagnostics['tests'].append({
                        'name': 'Windows Network Diagnostics',
                        'status': 'fail',
                        'message': f'Windows diagnostics failed: {str(e)}',
                        'duration_ms': (time.time() - win_diag_start) * 1000
                    })
            
            # Test 3: HTTP connectivity test
            http_test_start = time.time()
            try:
                test_response = requests.get('http://localhost:3001/health', timeout=5)
                if test_response.status_code == 200:
                    diagnostics['tests'].append({
                        'name': 'HTTP Connectivity',
                        'status': 'pass',
                        'message': 'Successfully connected to local server',
                        'duration_ms': (time.time() - http_test_start) * 1000
                    })
                else:
                    diagnostics['tests'].append({
                        'name': 'HTTP Connectivity',
                        'status': 'fail',
                        'message': f'HTTP request returned status {test_response.status_code}',
                        'duration_ms': (time.time() - http_test_start) * 1000
                    })
            except Exception as e:
                diagnostics['tests'].append({
                    'name': 'HTTP Connectivity',
                    'status': 'fail',
                    'message': f'HTTP request failed: {str(e)}',
                    'duration_ms': (time.time() - http_test_start) * 1000
                })
            
            # Calculate total test duration
            diagnostics['total_duration_ms'] = (time.time() - start_time) * 1000
            diagnostics['success'] = all(test['status'] == 'pass' for test in diagnostics['tests'])
            
            return jsonify(diagnostics)
            
        except Exception as e:
            logging.error(f"Error in network test: {e}")
            return jsonify({
                'success': False,
                'error': str(e),
                'timestamp': time.time()
            }), 500

    @app.route('/process-diagnostics', methods=['GET'])
    def process_diagnostics():
        """Get process diagnostics including count and port usage"""
        try:
            from utils import get_process_diagnostics
            result = get_process_diagnostics()
            return jsonify(result)
        except Exception as e:
            logging.error(f"Error getting process diagnostics: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/cleanup-processes', methods=['POST'])
    def cleanup_processes():
        """Clean up YoutubetoPremiere processes"""
        try:
            from utils import cleanup_youtube_premiere_processes
            
            data = request.get_json() or {}
            force = data.get('force', False)
            
            result = cleanup_youtube_premiere_processes(force=force)
            return jsonify(result)
        except Exception as e:
            logging.error(f"Error cleaning up processes: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/count-processes', methods=['GET'])
    def count_processes():
        """Count YoutubetoPremiere processes"""
        try:
            from utils import count_youtube_premiere_processes
            count = count_youtube_premiere_processes()
            return jsonify({'success': True, 'count': count})
        except Exception as e:
            logging.error(f"Error counting processes: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/check-port', methods=['GET'])
    def check_port():
        """Check port usage"""
        try:
            from utils import check_port_usage
            port = request.args.get('port', 3001, type=int)
            result = check_port_usage(port)
            return jsonify(result)
        except Exception as e:
            logging.error(f"Error checking port: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/check-import-trigger', methods=['GET'])
    def check_import_trigger():
        """Check for pending import triggers (HTTP fallback for Premiere extension)"""
        try:
            if pending_import_triggers:
                # Return the first pending trigger and remove it from the queue
                trigger = pending_import_triggers.pop(0)
                logging.info(f"HTTP fallback: Returning import trigger for {trigger.get('path', 'unknown')}")
                return jsonify({'trigger': trigger})
            else:
                # No triggers pending
                return jsonify({'trigger': None})
        except Exception as e:
            logging.error(f"Error checking import trigger: {e}")
            return jsonify({'error': str(e)}), 500

    @app.route('/trigger-import', methods=['POST'])
    def trigger_import():
        """Trigger an import via HTTP (fallback method)"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            path = data.get('path')
            if not path:
                return jsonify({'error': 'No path provided'}), 400
            
            # Verify file exists
            if not os.path.exists(path):
                logging.error(f"File does not exist for HTTP trigger: {path}")
                return jsonify({'error': 'File not found'}), 404
            
            # Add to pending triggers queue for HTTP fallback polling
            trigger_data = {
                'path': path,
                'url': data.get('url', ''),
                'timestamp': time.time()
            }
            pending_import_triggers.append(trigger_data)
            
            logging.info(f"HTTP fallback: Added import trigger for {path}")
            return jsonify({'success': True, 'message': 'Import trigger added'})
            
        except Exception as e:
            logging.error(f"Error triggering import: {e}")
            return jsonify({'error': str(e)}), 500


    

