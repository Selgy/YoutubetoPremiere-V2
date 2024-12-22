from flask import request, jsonify
import logging
import json
from video_processing import handle_video_url
from utils import play_notification_sound
import os
import sys

def register_routes(app, socketio, settings):

    @app.route('/')
    def root():
        return "Premiere is alive", 200
    
    @app.route('/get-version', methods=['GET'])
    def get_version():
        return jsonify(version='2.1.6') 


    @app.route('/settings', methods=['POST'])
    def update_settings():
        try:
            new_settings = request.get_json()
            with open(settings['SETTINGS_FILE'], 'w') as f:
                json.dump(new_settings, f, indent=4)
            # Update the in-memory settings as well
            settings.update(new_settings)
            return jsonify(success=True), 200
        except KeyError as e:
            logging.error(f"KeyError: {e}")
            return jsonify(success=False, error=f"Missing key: {e}"), 400
        except Exception as e:
            logging.error(f"Exception: {e}")
            return jsonify(success=False, error=str(e)), 500

    @app.route('/handle-video-url', methods=['POST'])
    def handle_video_url_route():
        try:
            return handle_video_url(request, settings, socketio)
        except Exception as e:
            logging.error(f"Error handling video URL: {e}")
            return jsonify(success=False, error=str(e)), 500

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
