import os
import subprocess
import logging
import yt_dlp as youtube_dl
import re
from flask import jsonify
import sys
import platform
import time
from utils import (
    is_premiere_running,
    import_video_to_premiere,
    sanitize_title,
    generate_new_filename,
    play_notification_sound,
    get_default_download_path
)

def handle_video_url(request, settings, socketio):
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
        download_and_process_clip(video_url, resolution, download_path, clip_start, clip_end, download_mp3, settings['ffmpeg_path'], socketio)
    elif download_type == 'full':
        download_video(video_url, resolution, download_path, download_mp3, settings['ffmpeg_path'], socketio, settings)
    elif download_type == 'audio':
        download_audio(video_url, download_path, settings['ffmpeg_path'], socketio, settings)

    return jsonify(success=True), 200



def download_and_process_clip(video_url, resolution, download_path, clip_start, clip_end, download_mp3, ffmpeg_path, socketio):
    clip_duration = clip_end - clip_start
    logging.info(f"Received clip parameters: clip_start={clip_start}, clip_end={clip_end}, clip_duration={clip_duration}")

    download_path = download_path if download_path else get_default_download_path()
    if download_path is None:
        logging.error("No active Premiere Pro project found.")
        return

    video_info = youtube_dl.YoutubeDL().extract_info(video_url, download=False)
    sanitized_title = sanitize_title(video_info['title'])
    clip_suffix = "_clip"
    video_filename = generate_new_filename(download_path, sanitized_title, 'mp4', clip_suffix)
    video_file_path = os.path.join(download_path, video_filename)

    clip_start_str = time.strftime('%H:%M:%S', time.gmtime(clip_start))
    clip_end_str = time.strftime('%H:%M:%S', time.gmtime(clip_end))

    base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))

    # Check the operating system
    if platform.system() == "Windows":
        yt_dlp_filename = "yt-dlp.exe"
        yt_dlp_path = os.path.join(base_path, 'app', '_include', yt_dlp_filename)
    else:
        yt_dlp_filename = "yt-dlp"
        yt_dlp_path = os.path.join(base_path, yt_dlp_filename)

    yt_dlp_command = [
        yt_dlp_path,
        '--format', f'bestvideo[vcodec^=avc1][ext=mp4][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]',
        '--ffmpeg-location', os.path.dirname(ffmpeg_path),
        '--download-sections', f'*{clip_start_str}-{clip_end_str}',
        '--output', video_file_path,
        '--postprocessor-args', 'ffmpeg:-c:v copy -c:a copy',
        '--no-check-certificate',
        '--extractor-args', 'youtube:player_client=ios,mweb',
        video_url
    ]

    logging.info(f"Using ffmpeg from directory: {os.path.dirname(ffmpeg_path)}")
    try:
        subprocess.run(yt_dlp_command, check=True)
        logging.info(f"Clip downloaded: {video_file_path}")

        # Add URL to metadata
        metadata_command = [
            ffmpeg_path,
            '-i', video_file_path,
            '-metadata', f'comment={video_url}',
            '-codec', 'copy',  # To avoid re-encoding the video
            f'{video_file_path}_with_metadata.mp4'
        ]

        try:
            subprocess.run(metadata_command, check=True)
            # Replace original file with the one containing metadata
            os.replace(f'{video_file_path}_with_metadata.mp4', video_file_path)
            logging.info(f"Metadata added: {video_file_path}")
        except subprocess.CalledProcessError as e:
            logging.error(f"Error adding metadata: {e}")
            socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
            return

        socketio.emit('import_video', {'path': video_file_path})
        logging.info("Clip imported to Premiere Pro")
        play_notification_sound()
        socketio.emit('download-complete')
    except subprocess.CalledProcessError as e:
        logging.error(f"Error downloading clip: {e}")
        socketio.emit('download-failed', {'message': 'Failed to download clip.'})



def download_video(video_url, resolution, download_path, download_mp3, ffmpeg_path, socketio, settings):
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

        # Get video info first
        with youtube_dl.YoutubeDL() as ydl:
            video_info = ydl.extract_info(video_url, download=False)
            if not isinstance(video_info, dict):
                raise ValueError("Failed to get video info")
                
            sanitized_title = sanitize_title(video_info.get('title', 'video'))
            extension = 'mp4' if not download_mp3 else 'wav'
            output_filename = generate_new_filename(final_download_path, sanitized_title, extension)
            sanitized_output_template = os.path.join(final_download_path, output_filename)

            # Create yt-dlp options with the correct output path
            ydl_opts = {
                'outtmpl': sanitized_output_template,
                'ffmpeg_location': ffmpeg_dir,
                'merge_output_format': 'mp4',
                'format': 'bestaudio[ext=m4a]/best' if download_mp3 else f'bestvideo[ext=mp4][vcodec^=avc1][height<={resolution}]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                'progress_hooks': [lambda d: progress_hook(d, socketio)],
                'verbose': True
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

            logging.info(f"Using ffmpeg from directory: {ffmpeg_dir}")
            logging.info(f"Downloading to: {sanitized_output_template}")
            
            # Download with the new options
            with youtube_dl.YoutubeDL(ydl_opts) as ydl_download:
                result = ydl_download.download([video_url])

            if result == 0 and os.path.exists(sanitized_output_template):
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
                    
                    # Use settings for notification sound
                    volume = settings.get('notificationVolume', 30) / 100
                    sound_type = settings.get('notificationSound', 'default')
                    play_notification_sound(volume=volume, sound_type=sound_type)
                    
                    # Emit import event once and wait for completion
                    socketio.emit('import_video', {'path': sanitized_output_template})
                    time.sleep(0.5)  # Give time for import to process
                    socketio.emit('download-complete')
                except subprocess.CalledProcessError as e:
                    logging.error(f"Error adding metadata: {e}")
                    socketio.emit('download-failed', {'message': 'Failed to add metadata.'})
                    return
            else:
                logging.error("Video download failed.")
                socketio.emit('download-failed', {'message': 'Failed to download video.'})
    except Exception as e:
        logging.error(f"Error during download: {e}")
        socketio.emit('download-failed', {'message': str(e)})


def download_audio(video_url, download_path, ffmpeg_path, socketio, settings=None):
    logging.info(f"Starting audio download for URL: {video_url}")
    video_info = youtube_dl.YoutubeDL().extract_info(video_url, download=False)
    sanitized_title = sanitize_title(video_info['title'])
    final_download_path = download_path if download_path else get_default_download_path(socketio)
    if final_download_path is None:
        logging.error("No active Premiere Pro project found.")
        socketio.emit('download-failed', {'message': 'No active Premiere Pro project found.'})
        return

    audio_filename = generate_new_filename(final_download_path, sanitized_title, 'wav')
    sanitized_output_template = os.path.join(final_download_path, audio_filename)

    ydl_opts = {
        'outtmpl': sanitized_output_template.replace('.wav', ''),  # Avoid adding .wav twice
        'ffmpeg_location': os.path.dirname(ffmpeg_path),  # Pass the directory containing ffmpeg
        'format': 'bestaudio/best',
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'mweb']  
            }
        },
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'progress_hooks': [lambda d: progress_hook(d, socketio)]
    }

    def progress_hook(d, socketio):
        if d['status'] == 'downloading':
            percentage = d['_percent_str']
            percentage = re.sub(r'\x1B\[[0-?]*[ -/]*[@-~]', '', percentage)
            logging.info(f'Progress: {percentage}')
            socketio.emit('percentage', {'percentage': percentage})

    logging.info(f"Using ffmpeg from directory: {os.path.dirname(ffmpeg_path)}")
    try:
        with youtube_dl.YoutubeDL(ydl_opts) as ydl:
            result = ydl.download([video_url])
        if result == 0 and os.path.exists(sanitized_output_template):
            logging.info(f"Audio downloaded: {sanitized_output_template}")
            socketio.emit('import_video', {'path': sanitized_output_template})
            
            # Use settings for notification sound if available
            if settings:
                volume = settings.get('notificationVolume', 30) / 100
                sound_type = settings.get('notificationSound', 'default')
                play_notification_sound(volume=volume, sound_type=sound_type)
            else:
                play_notification_sound()  # Use defaults
                
            socketio.emit('download-complete')
        else:
            logging.error("Audio download failed.")
            socketio.emit('download-failed', {'message': 'Failed to download audio.'})
    except Exception as e:
        logging.error(f"Error downloading audio: {e}")
        socketio.emit('download-failed', {'message': 'Failed to download audio.'})

# Main execution
if __name__ == "__main__":
    # Add any additional setup if necessary
    logging.basicConfig(level=logging.INFO)
    logging.info("Script started")
