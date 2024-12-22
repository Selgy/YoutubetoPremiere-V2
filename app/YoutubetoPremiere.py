import os
import time
import logging
import threading
import platform
import sys
from flask_cors import CORS
from flask import Flask, request, jsonify
from flask_socketio import SocketIO
from routes import register_routes
from utils import load_settings, monitor_premiere_and_shutdown, play_notification_sound

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Add ffmpeg to PATH
script_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
ffmpeg_dir = os.path.join(script_dir, 'app')
os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")

app = Flask(__name__)
CORS(app)
try:
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
except ValueError:
    try:
        socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
    except ValueError:
        socketio = SocketIO(app, cors_allowed_origins="*", async_mode=None)

# Add this after socketio initialization
@socketio.on('connect')
def handle_connect():
    logging.info('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    logging.info('Client disconnected')

@socketio.on('import_video')
def handle_import_video(data):
    video_path = data.get('path')
    # Add a flag to track if this video has been imported
    if not hasattr(handle_import_video, '_imported_videos'):
        handle_import_video._imported_videos = set()

    if video_path not in handle_import_video._imported_videos:
        logging.info(f'Importing video: {video_path}')
        handle_import_video._imported_videos.add(video_path)
        # Emit import_video event to the client
        socketio.emit('import_video', {'path': video_path})

@socketio.on('import_complete')
def handle_import_complete(data):
    success = data.get('success', False)
    path = data.get('path', '')
    if success:
        logging.info(f'Successfully imported video: {path}')
        # Play notification sound after successful import
        settings = load_settings()
        volume = settings.get('notificationVolume', 30) / 100
        sound_type = settings.get('notificationSound', 'default')
        play_notification_sound(volume=volume, sound_type=sound_type)
        socketio.emit('import_status', {'success': True, 'message': 'Video imported successfully'})
    else:
        error = data.get('error', 'Unknown error')
        logging.error(f'Failed to import video: {path}. Error: {error}')
        socketio.emit('import_status', {'success': False, 'message': f'Import failed: {error}'})

@socketio.on('get_project_path')
def handle_get_project_path():
    logging.info('Requesting project path from panel')
    socketio.emit('request_project_path')

should_shutdown = False

def run_server():
    settings = load_settings()
    logging.info('Settings loaded: %s', settings)
    register_routes(app, socketio, settings)

    server_thread = threading.Thread(target=lambda: socketio.run(
        app, 
        host='localhost', 
        port=3001,
        debug=False,
        use_reloader=False
    ))
    server_thread.start()

    premiere_monitor_thread = threading.Thread(target=monitor_premiere_and_shutdown_wrapper)
    premiere_monitor_thread.start()

    while not should_shutdown:
        time.sleep(1)

    logging.info("Shutting down the application.")
    os._exit(0)

def monitor_premiere_and_shutdown_wrapper():
    global should_shutdown
    monitor_premiere_and_shutdown()
    should_shutdown = True

def run_extendscript(script):
    try:
        script_path = os.path.join(os.environ['TEMP'], 'YoutubetoPremiere_script.jsx')
        result_path = os.path.join(os.environ['TEMP'], 'YoutubetoPremiere_result.txt')

        # Remove any existing result file
        if os.path.exists(result_path):
            try:
                os.remove(result_path)
            except:
                pass

        # Write the script
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script)

        # Wait for the result file to be created by the panel extension
        timeout = 30  # 30 seconds timeout
        start_time = time.time()
        while not os.path.exists(result_path):
            if time.time() - start_time > timeout:
                raise TimeoutError("Timeout waiting for ExtendScript result")
            time.sleep(0.1)

        # Give a small delay to ensure the file is completely written
        time.sleep(0.1)

        # Read the result
        try:
            with open(result_path, 'r', encoding='utf-8') as f:
                result = f.read().strip()
            return result
        except Exception as e:
            logging.error(f"Error reading result file: {e}")
            return None

    except Exception as e:
        logging.error(f'Error running ExtendScript: {e}')
        return None
    finally:
        # Clean up
        for file_path in [script_path, result_path]:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass

if __name__ == "__main__":
    run_server()
