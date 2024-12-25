import os
import subprocess
import logging
import yt_dlp as youtube_dl
import re
from flask import jsonify
import sys
import platform
import time
import requests
from utils import (
    is_premiere_running,
    import_video_to_premiere,
    sanitize_title,
    generate_new_filename,
    play_notification_sound,
    get_default_download_path,
    get_license_key
)

def validate_license(license_key):
    if not license_key:
        return False

    # Try Gumroad validation
    try:
        gumroad_response = requests.post('https://api.gumroad.com/v2/licenses/verify', {
            'product_id': '9yYJT15dJO3wB4Z74N-EUg==',
            'license_key': license_key
        })

        if gumroad_response.ok and gumroad_response.json().get('success'):
            return True

        # Try Shopify validation
        api_token = 'eHyU10yFizUV5qUJaFS8koE1nIx2UCDFNSoPVdDRJDI7xtunUK6ZWe40vfwp'
        shopify_response = requests.post(
            f'https://app-easy-product-downloads.fr/api/get-license-key',
            params={'license_key': license_key, 'api_token': api_token}
        )

        if shopify_response.ok and shopify_response.json().get('status') == 'success':
            return True

    except Exception as e:
        logging.error(f"Error validating license: {e}")
        return False

    return False

def check_ffmpeg(settings, socketio):
    """Check if FFmpeg is available and configured correctly."""
    if not settings.get('ffmpeg_path'):
        error_msg = "There was a problem with the video processor. Please try restarting the application."
        socketio.emit('download-failed', {'message': error_msg})
        return False
    return True

def handle_video_url(request, settings, socketio, current_download):
    # Check FFmpeg availability first
    if not check_ffmpeg(settings, socketio):
        return jsonify(error="FFmpeg not available"), 400

    # Check license validity
    license_key = get_license_key()
    if not validate_license(license_key):
        error_message = "No valid license found. Please enter a valid license key."
        logging.error(error_message)
        socketio.emit('download-failed', {'error': error_message})
        return jsonify(error=error_message), 403

    data = request.get_json()
    logging.info(f"Received data: {data}")

    if not data:
        logging.error("No data received in request.")
        return jsonify(error="No data provided"), 400

    video_url = data.get('videoUrl')
    current_time = data.get('currentTime')
    download_type = data.get('downloadType')
    download_path = data.get('downloadPath', settings.get('downloadPath', '')).strip()

    # If download_path is empty, get it from the project
    if not download_path:
        download_path = get_default_download_path(socketio)
        if download_path is None:
            return jsonify(error="No active Premiere Pro project found."), 400

    try:
        seconds_before = int(data.get('secondsBefore', settings['secondsBefore']))
        seconds_after = int(data.get('secondsAfter', settings['secondsAfter']))
    except (ValueError, TypeError):
        logging.error("Invalid secondsBefore or secondsAfter values.")
        return jsonify(error="Invalid time settings"), 400

    if download_type not in ['clip', 'full', 'audio']:
        logging.error(f"Invalid download type: {download_type}")
        return jsonify(error="Invalid download type"), 400

    resolution = settings.get('resolution')
    download_mp3 = settings.get('downloadMP3')

    if not is_premiere_running():
        return jsonify(error="Adobe Premiere Pro is not running"), 400

    if download_type == 'clip':
        clip_start = max(0, current_time - seconds_before)
        clip_end = current_time + seconds_after
        download_and_process_clip(video_url, resolution, download_path, clip_start, clip_end, download_mp3, settings['ffmpeg_path'], socketio, settings, current_download)
    elif download_type == 'full':
        download_video(video_url, resolution, download_path, download_mp3, settings['ffmpeg_path'], socketio, settings, current_download)
    elif download_type == 'audio':
        download_audio(video_url, download_path, settings['ffmpeg_path'], socketio, settings, current_download)

    return jsonify(success=True), 200



def download_and_process_clip(video_url, resolution, download_path, clip_start, clip_end, download_mp3, ffmpeg_path, socketio, settings, current_download):
    if not check_ffmpeg(settings, socketio):
        return

    clip_duration = clip_end - clip_start
    logging.info(f"Received clip parameters: clip_start={clip_start}, clip_end={clip_end}, clip_duration={clip_duration}")

    final_download_path = download_path if download_path else get_default_download_path(socketio)
    if final_download_path is None:
        logging.error("No active Premiere Pro project found.")
        socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
        return

    try:
        video_info = youtube_dl.YoutubeDL().extract_info(video_url, download=False)
        sanitized_title = sanitize_title(video_info['title'])
        clip_suffix = "_clip"
        video_filename = generate_new_filename(final_download_path, sanitized_title, 'mp4', clip_suffix)
        video_file_path = os.path.join(final_download_path, video_filename)

        # Configure yt-dlp options
        ydl_opts = {
            'format': f'bestvideo[ext=mp4][vcodec^=avc1][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': video_file_path,
            'force_keyframes_at_cuts': True,
            'ffmpeg_location': os.path.dirname(ffmpeg_path),
            'extractor_args': {'youtube': {'player_client': ['ios', 'mweb']}},
            'progress_hooks': [lambda d: progress_hook(d, socketio)],
            'postprocessor_hooks': [lambda d: logging.info(f"Postprocessing: {d}")],
            'force_generic_extractor': False
        }

        def progress_hook(d, socketio):
            if d['status'] == 'downloading':
                try:
                    percentage = d.get('_percent_str', '0%')
                    percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                    logging.info(f'Progress: {percentage}')
                    socketio.emit('percentage', {'percentage': percentage})
                except Exception as e:
                    logging.error(f"Error in progress hook: {e}")

        # Download the clip using command line arguments
        command = [
            sys.executable, '-m', 'yt_dlp',
            '--download-sections', f'*{clip_start}-{clip_end}',
            '--force-keyframes-at-cuts',
            '-f', ydl_opts['format'],
            '-o', video_file_path,
            '--ffmpeg-location', os.path.dirname(ffmpeg_path),
            '--postprocessor-args', f'ffmpeg:-ss {clip_start} -t {clip_end - clip_start}',
            '--no-keep-video',
            video_url
        ]
        
        try:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            current_download['process'] = process
            stdout, stderr = process.communicate()
            
            if process.returncode != 0 and process.returncode != -15:  # -15 is the signal for termination
                error_message = f"Error downloading clip: {stderr}"
                logging.error(error_message)
                socketio.emit('download-failed', {'message': error_message})
                return
            elif process.returncode == -15:  # Download was cancelled
                if os.path.exists(video_file_path):
                    os.remove(video_file_path)
                return
        except subprocess.CalledProcessError as e:
            error_message = f"Error downloading clip: {e.stderr}"
            logging.error(error_message)
            socketio.emit('download-failed', {'message': error_message})
            return
        finally:
            current_download['process'] = None

        if os.path.exists(video_file_path):
            logging.info(f"Clip downloaded: {video_file_path}")

            # Add URL to metadata
            metadata_command = [
                ffmpeg_path,
                '-i', video_file_path,
                '-metadata', f'comment={video_url}',
                '-codec', 'copy',
                f'{video_file_path}_with_metadata.mp4'
            ]

            try:
                subprocess.run(metadata_command, check=True)
                os.replace(f'{video_file_path}_with_metadata.mp4', video_file_path)
                logging.info(f"Metadata added: {video_file_path}")
                
                socketio.emit('import_video', {'path': video_file_path})
                socketio.emit('download-complete')
            except subprocess.CalledProcessError as e:
                logging.error(f"Error adding metadata: {e}")
                socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                return

    except Exception as e:
        error_message = f"Error downloading clip: {str(e)}"
        logging.error(error_message)
        logging.error(f"Full error details: {type(e).__name__}")
        socketio.emit('download-failed', {'message': error_message})



def download_video(video_url, resolution, download_path, download_mp3, ffmpeg_path, socketio, settings, current_download):
    if not check_ffmpeg(settings, socketio):
        return

    logging.info(f"Starting video download for URL: {video_url}")
    
    try:
        # Get the download path first
        final_download_path = download_path if download_path else get_default_download_path(socketio)
        if final_download_path is None:
            logging.error("No active Premiere Pro project found.")
            socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
            return None

        # Configure yt-dlp to use our ffmpeg
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ["PATH"]
        logging.info(f"Added ffmpeg directory to PATH: {ffmpeg_dir}")

        def progress_hook(d):
            if d['status'] == 'downloading':
                try:
                    percentage = d.get('_percent_str', '0%').strip()
                    percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                    logging.info(f'Download Progress: {percentage}')
                    socketio.emit('percentage', {'percentage': percentage})
                except Exception as e:
                    logging.error(f"Error in progress hook: {e}")

        # Get video info first
        with youtube_dl.YoutubeDL() as ydl:
            video_info = ydl.extract_info(video_url, download=False)
            if not isinstance(video_info, dict):
                raise ValueError("Failed to get video info")
                
            sanitized_title = sanitize_title(video_info.get('title', 'video'))
            extension = 'mp4' if not download_mp3 else 'wav'
            output_filename = generate_new_filename(final_download_path, sanitized_title, extension)
            sanitized_output_template = os.path.join(final_download_path, output_filename)

            # Create command for yt-dlp with progress hook
            command = [
                sys.executable, '-m', 'yt_dlp',
                '-f', 'bestaudio[ext=m4a]/best' if download_mp3 else f'bestvideo[ext=mp4][vcodec^=avc1][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '-o', sanitized_output_template,
                '--ffmpeg-location', ffmpeg_dir,
                '--merge-output-format', 'mp4',
                '--progress-template', '%(progress._percent_str)s',
                video_url
            ]

            try:
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                current_download['process'] = process
                
                # Read output in real-time to get progress
                while True:
                    output = process.stdout.readline()
                    if output == '' and process.poll() is not None:
                        break
                    if output:
                        # Try to extract percentage
                        if '%' in output:
                            percentage = output.strip()
                            logging.info(f'Download Progress: {percentage}')
                            socketio.emit('percentage', {'percentage': percentage})
                
                stdout, stderr = process.communicate()
                
                if process.returncode != 0 and process.returncode != -15:  # -15 is the signal for termination
                    error_message = f"Error downloading video: {stderr}"
                    logging.error(error_message)
                    socketio.emit('download-failed', {'message': error_message})
                    return
                elif process.returncode == -15:  # Download was cancelled
                    if os.path.exists(sanitized_output_template):
                        os.remove(sanitized_output_template)
                    return
            except subprocess.CalledProcessError as e:
                error_message = f"Error downloading video: {e.stderr}"
                logging.error(error_message)
                socketio.emit('download-failed', {'message': error_message})
                return
            finally:
                current_download['process'] = None

            if os.path.exists(sanitized_output_template):
                logging.info(f"Video downloaded: {sanitized_output_template}")
                
                # Add URL to metadata
                metadata_command = [
                    ffmpeg_path,
                    '-i', sanitized_output_template,
                    '-metadata', f'comment={video_url}',
                    '-codec', 'copy',
                    f'{sanitized_output_template}_with_metadata.mp4'
                ]

                try:
                    subprocess.run(metadata_command, check=True)
                    os.replace(f'{sanitized_output_template}_with_metadata.mp4', sanitized_output_template)
                    logging.info(f"Metadata added: {sanitized_output_template}")
                    
                    socketio.emit('import_video', {'path': sanitized_output_template})
                    time.sleep(0.5)  # Give time for import to process
                    socketio.emit('download-complete')
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error adding metadata: {e}")
                    socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                    return

    except Exception as e:
        logging.error(f"Error during download: {e}")
        socketio.emit('download-failed', {'message': str(e)})


def download_audio(video_url, download_path, ffmpeg_path, socketio, settings=None, current_download=None):
    logging.info(f"Starting audio download for URL: {video_url}")
    try:
        video_info = youtube_dl.YoutubeDL().extract_info(video_url, download=False)
        sanitized_title = sanitize_title(video_info['title'])
        final_download_path = download_path if download_path else get_default_download_path(socketio)
        if final_download_path is None:
            logging.error("No active Premiere Pro project found.")
            socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
            return

        audio_filename = generate_new_filename(final_download_path, sanitized_title, 'wav')
        sanitized_output_template = os.path.join(final_download_path, audio_filename)

        # Create command for yt-dlp with audio extraction and progress tracking
        command = [
            sys.executable, '-m', 'yt_dlp',
            '-f', 'bestaudio/best',
            '-o', sanitized_output_template.replace('.wav', ''),  # yt-dlp will add extension
            '--ffmpeg-location', os.path.dirname(ffmpeg_path),
            '--extract-audio',
            '--audio-format', 'wav',
            '--audio-quality', '192',
            '--progress-template', '%(progress._percent_str)s',
            video_url
        ]

        try:
            process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            current_download['process'] = process
            
            # Read output in real-time to get progress
            while True:
                output = process.stdout.readline()
                if output == '' and process.poll() is not None:
                    break
                if output:
                    # Try to extract percentage
                    if '%' in output:
                        percentage = output.strip()
                        logging.info(f'Download Progress: {percentage}')
                        socketio.emit('percentage', {'percentage': percentage})
            
            stdout, stderr = process.communicate()
            
            if process.returncode != 0 and process.returncode != -15:  # -15 is the signal for termination
                error_message = f"Error downloading audio: {stderr}"
                logging.error(error_message)
                socketio.emit('download-failed', {'message': error_message})
                return
            elif process.returncode == -15:  # Download was cancelled
                if os.path.exists(sanitized_output_template):
                    os.remove(sanitized_output_template)
                return
        except subprocess.CalledProcessError as e:
            error_message = f"Error downloading audio: {e.stderr}"
            logging.error(error_message)
            socketio.emit('download-failed', {'message': error_message})
            return
        finally:
            current_download['process'] = None

        if os.path.exists(sanitized_output_template):
            logging.info(f"Audio downloaded: {sanitized_output_template}")
            
            # Add URL to metadata
            metadata_command = [
                ffmpeg_path,
                '-i', sanitized_output_template,
                '-metadata', f'comment={video_url}',
                '-codec', 'copy',
                f'{sanitized_output_template}_with_metadata.wav'
            ]

            try:
                subprocess.run(metadata_command, check=True)
                os.replace(f'{sanitized_output_template}_with_metadata.wav', sanitized_output_template)
                logging.info(f"Metadata added: {sanitized_output_template}")
                
                socketio.emit('import_video', {'path': sanitized_output_template})
                socketio.emit('download-complete')
            except subprocess.CalledProcessError as e:
                logging.error(f"Error adding metadata: {e}")
                socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                return

    except Exception as e:
        logging.error(f"Error during audio download: {e}")
        socketio.emit('download-failed', {'message': str(e)})

# Main execution
if __name__ == "__main__":
    # Add any additional setup if necessary
    logging.basicConfig(level=logging.INFO)
    logging.info("Script started")
