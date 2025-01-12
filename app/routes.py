from flask import request, jsonify
import logging
import json
from video_processing import handle_video_url
from utils import play_notification_sound, save_license_key, get_license_key, load_settings, save_settings
import os
import sys
import requests
import socket

def register_routes(app, socketio, settings):
    current_download = {'process': None}
    connected_clients = set()

    @socketio.on('connect')
    def handle_connect():
        client_id = request.sid
        connected_clients.add(client_id)
        logging.info(f'Client connected: {client_id}')
        socketio.emit('connection_status', {'status': 'connected'}, room=client_id)

    @socketio.on('disconnect')
    def handle_disconnect():
        client_id = request.sid
        if client_id in connected_clients:
            connected_clients.remove(client_id)
        logging.info(f'Client disconnected: {client_id}')

    @app.route('/')
    def root():
        return "Premiere is alive", 200
    
    @app.route('/get-version', methods=['GET'])
    def get_version():
        return jsonify(version='2.1.6') 


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
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400

            # Accept both 'url' and 'videoUrl' parameters for backward compatibility
            video_url = data.get('url') or data.get('videoUrl')
            if not video_url:
                return jsonify({'error': 'No URL provided'}), 400

            download_type = data.get('downloadType', 'video')
            
            # Emit start event to all connected clients
            socketio.emit('download_started', {'url': video_url})
            
            # For clip downloads, get the current time and settings
            if download_type == 'clip':
                current_time = data.get('currentTime', 0)
                current_settings = load_settings()
                seconds_before = float(current_settings.get('secondsBefore', 15))
                seconds_after = float(current_settings.get('secondsAfter', 15))
                
                # Calculate clip start and end times
                clip_start = max(0, current_time - seconds_before)
                clip_end = current_time + seconds_after
                
                # Process the video with clip parameters
                result = handle_video_url(
                    video_url, 
                    download_type, 
                    current_download, 
                    socketio,
                    clip_start=clip_start,
                    clip_end=clip_end
                )
            else:
                # Process the video normally for other types
                result = handle_video_url(video_url, download_type, current_download, socketio)
            
            if result.get('error'):
                error_msg = result['error']
                socketio.emit('download_error', {'error': error_msg})
                return jsonify({'error': error_msg}), 500
                
            # If successful, return the result
            if result.get('path'):
                # Note: The download_complete and import_video events are now emitted by handle_video_url
                return jsonify(result), 200
            
            return jsonify({'error': 'Unknown error occurred'}), 500
            
        except Exception as e:
            error_msg = f"Error processing video URL: {str(e)}"
            logging.error(error_msg)
            socketio.emit('download_error', {'error': error_msg})
            return jsonify({'error': error_msg}), 500

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
            # Try to get all possible IP addresses
            hostname = socket.gethostname()
            possible_ips = []
            
            # Get all network interfaces
            for interface in socket.getaddrinfo(hostname, None):
                ip = interface[4][0]
                # Only include IPv4 addresses that aren't localhost
                if '.' in ip and ip != '127.0.0.1':
                    possible_ips.append(ip)
            
            # If we found any valid IPs, return the first one
            if possible_ips:
                logging.info(f'Found IP addresses: {possible_ips}')
                return jsonify({'ip': possible_ips[0]})
            
            # Fallback to the basic method
            local_ip = socket.gethostbyname(hostname)
            logging.info(f'Using fallback IP: {local_ip}')
            return jsonify({'ip': local_ip})
            
        except Exception as e:
            logging.error(f'Error getting IP address: {e}')
            return jsonify({'ip': 'localhost', 'error': str(e)})
