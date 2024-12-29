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
import traceback

def get_ffmpeg_path():
    """Get the path to ffmpeg executable"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    possible_locations = [
        os.path.dirname(script_dir),  # Parent directory
        script_dir,  # Current directory
        os.path.join(script_dir, 'ffmpeg'),  # ffmpeg subdirectory
        os.path.join(os.path.dirname(script_dir), 'ffmpeg'),  # Parent's ffmpeg subdirectory
        os.path.join(os.path.dirname(os.path.dirname(script_dir)), 'exec'),  # CEP extension exec directory
        os.environ.get('EXTENSION_ROOT', ''),  # Extension root if set
    ]
    
    # Add the current working directory and its parent
    possible_locations.extend([
        os.getcwd(),
        os.path.dirname(os.getcwd()),
        os.path.join(os.getcwd(), 'exec'),
        os.path.join(os.path.dirname(os.getcwd()), 'exec'),
    ])
    
    # Filter out empty paths and remove duplicates while preserving order
    possible_locations = list(dict.fromkeys(filter(None, possible_locations)))
    
    ffmpeg_name = 'ffmpeg.exe' if sys.platform == 'win32' else 'ffmpeg'
    
    for location in possible_locations:
        ffmpeg_path = os.path.join(location, ffmpeg_name)
        if os.path.exists(ffmpeg_path):
            logging.info(f"Found ffmpeg at: {ffmpeg_path}")
            # Verify the file is executable
            try:
                if sys.platform != 'win32':  # On Unix-like systems, check executable permission
                    if not os.access(ffmpeg_path, os.X_OK):
                        logging.warning(f"FFmpeg found at {ffmpeg_path} but is not executable")
                        continue
                # Try to run ffmpeg -version to verify it works
                result = subprocess.run([ffmpeg_path, '-version'], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE,
                                     timeout=5)
                if result.returncode == 0:
                    logging.info(f"Verified ffmpeg is working at: {ffmpeg_path}")
                    return ffmpeg_path  # Return the full path instead of just the directory
                else:
                    logging.warning(f"FFmpeg found at {ffmpeg_path} but failed version check")
            except Exception as e:
                logging.warning(f"Error verifying ffmpeg at {ffmpeg_path}: {str(e)}")
                continue

    logging.error("FFmpeg not found in any of the expected locations")
    logging.error(f"Searched locations: {possible_locations}")
    return None

def check_ffmpeg(settings, socketio):
    """Check if ffmpeg is available"""
    ffmpeg_path = get_ffmpeg_path()
    if not ffmpeg_path:
        error_msg = "FFmpeg not found. Please ensure ffmpeg is properly installed."
        logging.error(error_msg)
        if socketio:
            socketio.emit('error', {'message': error_msg})
        return False
    
    # Store the full path in settings for later use
    if settings is not None:
        settings['ffmpeg_path'] = ffmpeg_path
    
    return True

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
    logging.info(f"Request headers: {dict(request.headers)}")
    logging.info(f"Request method: {request.method}")
    logging.info(f"Request content type: {request.content_type}")

    if not data:
        logging.error("No data received in request.")
        return jsonify(error="No data provided"), 400

    video_url = data.get('videoUrl')
    logging.info(f"Video URL: {video_url}, Type: {type(video_url)}")
    if not video_url:
        logging.error("No video URL provided")
        return jsonify(error="No video URL provided"), 400

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
        import yt_dlp

        def progress_hook(d):
            if d['status'] == 'downloading':
                try:
                    if '_percent_str' in d:
                        percentage = d['_percent_str'].strip()
                        percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                        percentage = percentage.replace(' ', '')
                        if not percentage.endswith('%'):
                            percentage += '%'
                        logging.info(f'Progress: {percentage}')
                        socketio.emit('percentage', {'percentage': percentage, 'type': 'video'})
                except Exception as e:
                    logging.error(f"Error in progress hook: {e}")

        # Configure yt-dlp options
        format_string = f'bestvideo[vcodec^=avc1][ext=mp4][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]'
        logging.info(f"Using format string: {format_string}")

        # Extract video info first to get duration
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(video_url, download=False)
            if not info:
                raise Exception("Could not extract video information")
            
            # Get video details
            title = info.get('title', 'video')
            duration = info.get('duration', 0)
            
            if clip_start >= duration or clip_end > duration:
                raise Exception(f"Clip timestamps ({clip_start}-{clip_end}) exceed video duration ({duration})")

            # Sanitize the title and add clip suffix
            sanitized_title = sanitize_youtube_title(title)
            clip_title = f"{sanitized_title}_clip"
            
            # Get unique filename
            unique_filename = get_unique_filename(final_download_path, clip_title, 'mp4')
            output_path = os.path.join(final_download_path, unique_filename)
            logging.info(f"Setting output path to: {output_path}")

            # Download the clip section
            ydl_opts = {
                'format': format_string,
                'outtmpl': {
                    'default': os.path.join(final_download_path, os.path.splitext(unique_filename)[0] + '.%(ext)s')
                },
                'download_ranges': lambda info_dict, ydl: [{'start_time': clip_start, 'end_time': clip_end}],
                'force_keyframes_at_cuts': True,
                'ffmpeg_location': os.path.dirname(ffmpeg_path),  # Use the directory of the full path
                'progress_hooks': [progress_hook],
                'extractor_args': {'youtube': {'player_client': ['ios', 'mweb']}},
                'postprocessor_args': {
                    'ffmpeg': ['-ss', str(clip_start), '-t', str(clip_end - clip_start)]
                }
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])

            if os.path.exists(output_path):
                # Add URL to metadata
                metadata_command = [
                    ffmpeg_path,  # Use the full path here
                    '-i', output_path,
                    '-metadata', f'comment={video_url}',
                    '-codec', 'copy',
                    f'{output_path}_with_metadata.mp4'
                ]
                logging.info(f"Running FFmpeg metadata command: {' '.join(metadata_command)}")

                try:
                    subprocess.run(metadata_command, check=True)
                    os.replace(f'{output_path}_with_metadata.mp4', output_path)
                    
                    logging.info(f"Clip downloaded and processed: {output_path}")
                    socketio.emit('import_video', {'path': output_path})
                    socketio.emit('download-complete')
                    
                    return output_path
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error adding metadata: {e}")
                    logging.error(f"FFmpeg stderr: {e.stderr if hasattr(e, 'stderr') else 'No stderr'}")
                    socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                    return None
            else:
                logging.error(f"File not found at expected path: {output_path}")
                raise Exception(f"Downloaded file not found at {output_path}")

    except Exception as e:
        error_message = f"Error downloading clip: {str(e)}"
        logging.error(error_message)
        logging.error(f"Exception type: {type(e)}")
        logging.error(f"Exception traceback: {traceback.format_exc()}")
        socketio.emit('download-failed', {'message': error_message})
        return None

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

def download_video(video_url, resolution, download_path, download_mp3, ffmpeg_path, socketio, settings, current_download):
    if not check_ffmpeg(settings, socketio):
        return None

    try:
        import yt_dlp

        def progress_hook(d):
            if d['status'] == 'downloading':
                try:
                    if '_percent_str' in d:
                        percentage = d['_percent_str'].strip()
                        percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                        percentage = percentage.replace(' ', '')
                        if not percentage.endswith('%'):
                            percentage += '%'
                        logging.info(f'Progress: {percentage}')
                        socketio.emit('percentage', {'percentage': percentage, 'type': 'video'})
                except Exception as e:
                    logging.error(f"Error in progress hook: {e}")

        # Configure yt-dlp options
        format_string = f'bestvideo[vcodec^=avc1][ext=mp4][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]'
        logging.info(f"Using format string: {format_string}")

        final_download_path = download_path if download_path else get_default_download_path(socketio)
        if final_download_path is None:
            logging.error("No active Premiere Pro project found.")
            socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
            return None

        # Extract video info first
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(video_url, download=False)
            if not info:
                raise Exception("Could not extract video information")
            
            # Check if any video formats are available
            video_formats = [f for f in info.get('formats', []) if f.get('vcodec') != 'none' and f.get('acodec') != 'none']
            if not video_formats:
                error_msg = "This URL contains only images or is not a valid video. Please provide a URL to a video."
                logging.error(error_msg)
                socketio.emit('download-failed', {'message': error_msg})
                return None

            # Get video details
            title = info.get('title', 'video')
            
            # Sanitize the title
            sanitized_title = sanitize_youtube_title(title)
            logging.info(f"Sanitized title: {sanitized_title}")
            
            # Get unique filename
            unique_filename = get_unique_filename(final_download_path, sanitized_title, 'mp4')
            output_path = os.path.join(final_download_path, unique_filename)
            logging.info(f"Setting output path to: {output_path}")

            # Configure download options
            ydl_opts = {
                'format': format_string,
                'merge_output_format': 'mp4',
                'ffmpeg_location': os.path.dirname(ffmpeg_path),  # Use the directory of the full path
                'progress_hooks': [progress_hook],
                'postprocessor_hooks': [lambda d: socketio.emit('percentage', {'percentage': '100%'}) if d['status'] == 'finished' else None],
                'verbose': True,
                'outtmpl': {
                    'default': os.path.join(final_download_path, os.path.splitext(unique_filename)[0] + '.%(ext)s')
                }
            }

            # Download the video
            logging.info("Starting video download...")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.process_ie_result(info, download=True)

            # Get the final path of the downloaded file
            final_path = output_path
            logging.info(f"Expected final path: {final_path}")

            if os.path.exists(final_path):
                logging.info(f"File exists at: {final_path}")
                # Add URL to metadata
                metadata_command = [
                    ffmpeg_path,  # Use the full path here
                    '-i', final_path,
                    '-metadata', f'comment={video_url}',
                    '-codec', 'copy',
                    f'{final_path}_with_metadata.mp4'
                ]
                logging.info(f"Running FFmpeg command: {' '.join(metadata_command)}")

                try:
                    subprocess.run(metadata_command, check=True)
                    os.replace(f'{final_path}_with_metadata.mp4', final_path)
                    
                    logging.info(f"Video downloaded and processed: {final_path}")
                    socketio.emit('import_video', {'path': final_path})
                    socketio.emit('download-complete')
                    
                    return final_path
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error adding metadata: {e}")
                    logging.error(f"FFmpeg stderr: {e.stderr if hasattr(e, 'stderr') else 'No stderr'}")
                    socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                    return None
            else:
                logging.error(f"File not found at expected path: {final_path}")
                raise Exception(f"Downloaded file not found at {final_path}")

    except Exception as e:
        error_message = f"Error downloading video: {str(e)}"
        logging.error(error_message)
        logging.error(f"Exception type: {type(e)}")
        logging.error(f"Exception traceback: {traceback.format_exc()}")
        socketio.emit('download-failed', {'message': error_message})
        return None

def download_audio(video_url, download_path, ffmpeg_path, socketio, settings=None, current_download=None):
    logging.info(f"Starting audio download for URL: {video_url}")
    try:
        import yt_dlp

        def progress_hook(d):
            if d['status'] == 'downloading':
                try:
                    if '_percent_str' in d:
                        percentage = d['_percent_str'].strip()
                        percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
                        percentage = percentage.replace(' ', '')
                        if not percentage.endswith('%'):
                            percentage += '%'
                        logging.info(f'Progress: {percentage}')
                        socketio.emit('percentage', {'percentage': percentage, 'type': 'audio'})
                except Exception as e:
                    logging.error(f"Error in progress hook: {e}")

        final_download_path = download_path if download_path else get_default_download_path(socketio)
        if final_download_path is None:
            logging.error("No active Premiere Pro project found.")
            socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
            return

        # First extract info to get the title
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            info = ydl.extract_info(video_url, download=False)
            if not info:
                raise Exception("Could not extract video information")
            
            # Get video details
            title = info.get('title', 'video')
            
            # Sanitize the title
            sanitized_title = sanitize_youtube_title(title)
            
            # Get unique filename
            unique_filename = get_unique_filename(final_download_path, sanitized_title, 'wav')
            output_path = os.path.join(final_download_path, unique_filename)
            temp_path = os.path.join(final_download_path, 'temp_' + os.path.splitext(unique_filename)[0])
            logging.info(f"Setting output path to: {output_path}")

            # Configure yt-dlp for audio download
            ydl_opts = {
                'format': 'bestaudio/best',
                'ffmpeg_location': os.path.dirname(ffmpeg_path),  # Use the directory of the full path
                'progress_hooks': [progress_hook],
                'postprocessor_hooks': [lambda d: logging.info(f"Postprocessing: {d}")],
                'outtmpl': temp_path,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'wav',
                    'preferredquality': '192'
                }]
            }

            # Download and convert to WAV
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])

            # Check for the WAV file
            if os.path.exists(temp_path + '.wav'):
                # Move to final location
                os.replace(temp_path + '.wav', output_path)
                
                # Add URL to metadata
                metadata_command = [
                    ffmpeg_path,  # Use the full path here
                    '-i', output_path,
                    '-metadata', f'comment={video_url}',
                    '-c:a', 'copy',
                    f'{output_path}_with_metadata.wav'
                ]
                logging.info(f"Running FFmpeg command: {' '.join(metadata_command)}")

                try:
                    subprocess.run(metadata_command, check=True)
                    os.replace(f'{output_path}_with_metadata.wav', output_path)
                    
                    logging.info(f"Audio downloaded and processed: {output_path}")
                    socketio.emit('import_video', {'path': output_path})
                    socketio.emit('download-complete')
                    
                    return output_path
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error adding metadata: {e}")
                    logging.error(f"FFmpeg stderr: {e.stderr if hasattr(e, 'stderr') else 'No stderr'}")
                    socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                    return None
            else:
                logging.error(f"WAV file not found at: {temp_path}.wav")
                raise Exception("Failed to convert to WAV format")

    except Exception as e:
        error_message = f"Error downloading audio: {str(e)}"
        logging.error(error_message)
        logging.error(f"Exception type: {type(e)}")
        logging.error(f"Exception traceback: {traceback.format_exc()}")
        socketio.emit('download-failed', {'message': error_message})
        return None

# Main execution
if __name__ == "__main__":
    # Add any additional setup if necessary
    logging.basicConfig(level=logging.INFO)
    logging.info("Script started")
