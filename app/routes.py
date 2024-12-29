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

    @socketio.on('cancel-download')
    def handle_cancel_download(data):
        try:
            if current_download['process']:
                logging.info('Cancelling download process')
                current_download['process'].kill()
                current_download['process'] = None
                socketio.emit('download-cancelled')
                logging.info('Download cancelled successfully')
        except Exception as e:
            logging.error(f"Error cancelling download: {e}")
            socketio.emit('download-failed', {'message': str(e)})

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
            # Check license validity first
            license_key = get_license_key()
            if not license_key:
                socketio.emit('download-failed', {'error': 'No license key found'})
                return jsonify(success=False, error='No license key found'), 403

            # Try Gumroad validation
            gumroad_response = requests.post('https://api.gumroad.com/v2/licenses/verify', {
                'product_id': '9yYJT15dJO3wB4Z74N-EUg==',
                'license_key': license_key
            })

            if not (gumroad_response.ok and gumroad_response.json().get('success')):
                # Try Shopify validation
                api_token = 'eHyU10yFizUV5qUJaFS8koE1nIx2UCDFNSoPVdDRJDI7xtunUK6ZWe40vfwp'
                shopify_response = requests.post(
                    f'https://app-easy-product-downloads.fr/api/get-license-key',
                    params={'license_key': license_key, 'api_token': api_token}
                )

                if not (shopify_response.ok and shopify_response.json().get('status') == 'success'):
                    socketio.emit('download-failed', {'error': 'Invalid license key'})
                    return jsonify(success=False, error='Invalid license key'), 403

            # If we get here, license is valid, proceed with video download
            try:
                result = handle_video_url(request, settings, socketio, current_download)
                return result
            except Exception as e:
                error_message = str(e)
                logging.error(f"Error in video processing: {error_message}")
                socketio.emit('download-failed', {'error': error_message})
                return jsonify(success=False, error=error_message), 500

        except Exception as e:
            error_message = str(e)
            logging.error(f"Error handling video URL: {error_message}")
            socketio.emit('download-failed', {'error': error_message})
            return jsonify(success=False, error=error_message), 500

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
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        return jsonify({'ip': local_ip})
