import os
import uuid
import logging
import io
import time
import threading
from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
import yt_dlp

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
CORS(app)  # This will allow the Chrome extension to make requests to the server

# Create a temporary directory to store downloaded audio files
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp')
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Clean up old temporary files on startup
def cleanup_old_temp_files():
    """Remove any leftover temporary files from previous sessions"""
    try:
        for filename in os.listdir(TEMP_DIR):
            file_path = os.path.join(TEMP_DIR, filename)
            if os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                    logging.info(f"Removed old temporary file: {file_path}")
                except Exception as e:
                    logging.warning(f"Could not remove old file {file_path}: {e}")
    except Exception as e:
        logging.error(f"Error during temp file cleanup: {e}")

# Cleanup old files on startup
cleanup_old_temp_files()

@app.route('/get-audio', methods=['GET'])
def get_audio():
    video_url = request.args.get('url')
    logging.info(f"Received request for URL: {video_url}")
    if not video_url:
        logging.error("URL parameter is missing")
        return jsonify({"error": "URL parameter is missing"}), 400

    output_path = None  # Initialize output_path
    actual_file = None  # Track the actual downloaded file
    try:
        # Generate a unique base filename (without extension - yt-dlp adds it)
        unique_id = str(uuid.uuid4())
        base_path = os.path.join(TEMP_DIR, unique_id)

        # yt-dlp options optimized for speed:
        # - Download lowest quality audio (sufficient for speech recognition)
        # - No conversion (skip FFmpeg processing entirely)
        # - Native format (webm/m4a/ogg - all supported by Whisper)
        ydl_opts = {
            'format': 'worstaudio/worst',  # Lowest quality = fastest download + smaller file
            'outtmpl': base_path + '.%(ext)s',  # Let yt-dlp add the extension
            'quiet': False,
            'no_warnings': False,
            # No postprocessors = no FFmpeg conversion = much faster
        }
        logging.info(f"Using optimized yt-dlp options: {ydl_opts}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                logging.info(f"Starting download for {video_url}")
                info = ydl.extract_info(video_url, download=True)
                logging.info(f"Finished download for {video_url}")

                # Get the actual downloaded file path
                if 'requested_downloads' in info and info['requested_downloads']:
                    actual_file = info['requested_downloads'][0]['filepath']
                else:
                    # Fallback: find the file with our unique ID
                    for ext in ['webm', 'm4a', 'ogg', 'opus', 'mp3', 'mp4', 'wav']:
                        potential_file = f"{base_path}.{ext}"
                        if os.path.exists(potential_file):
                            actual_file = potential_file
                            break

        except yt_dlp.utils.DownloadError as e:
            logging.error(f"yt-dlp download failed: {e}")
            return jsonify({"error": f"yt-dlp failed: {e}"}), 500
        except Exception as e:
            logging.error(f"An unexpected error occurred during download: {e}")
            return jsonify({"error": f"An unexpected error occurred during download: {e}"}), 500


        # Check if the file was created
        if not actual_file or not os.path.exists(actual_file):
            logging.error(f"Audio file not found after download attempt")
            return jsonify({"error": "Failed to download audio, file not created"}), 500

        file_size = os.path.getsize(actual_file)
        file_ext = os.path.splitext(actual_file)[1]
        logging.info(f"Successfully created audio file: {actual_file} ({file_size / 1024 / 1024:.2f} MB)")

        # Determine MIME type based on extension
        mime_types = {
            '.webm': 'audio/webm',
            '.m4a': 'audio/mp4',
            '.ogg': 'audio/ogg',
            '.opus': 'audio/opus',
            '.mp3': 'audio/mpeg',
            '.mp4': 'audio/mp4',
            '.wav': 'audio/wav',
        }
        mime_type = mime_types.get(file_ext, 'audio/mpeg')
        download_name = f'audio{file_ext}'

        # Schedule delayed cleanup to avoid Windows file locking issues
        def delayed_cleanup(file_path, delay=5):
            """Delete file after delay to ensure it's no longer in use"""
            time.sleep(delay)
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logging.info(f"Successfully cleaned up temporary file: {file_path}")
            except Exception as e:
                logging.warning(f"Could not delete temporary file {file_path}: {e}")

        # Start cleanup in background thread
        cleanup_thread = threading.Thread(target=delayed_cleanup, args=(actual_file,), daemon=True)
        cleanup_thread.start()

        # Send the file and let the background thread handle cleanup
        return send_file(actual_file, as_attachment=True, download_name=download_name, mimetype=mime_type)

    except Exception as e:
        logging.error(f"A general error occurred in get_audio: {e}", exc_info=True)
        # Clean up the file even if sending fails
        if actual_file and os.path.exists(actual_file):
            logging.info(f"Cleaning up temporary file after error: {actual_file}")
            os.remove(actual_file)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8675)