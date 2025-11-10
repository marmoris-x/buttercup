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
    try:
        # Generate a unique filename for the downloaded audio
        unique_filename = f"{uuid.uuid4()}.mp3"
        output_path = os.path.join(TEMP_DIR, unique_filename)

        # yt-dlp options to download audio only
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.splitext(output_path)[0],
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'verbose': True, # Get all the debug info from yt-dlp
            'ffmpeg_location': os.path.dirname(os.path.abspath(__file__))
        }
        logging.info(f"Using yt-dlp options: {ydl_opts}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                logging.info(f"Starting download for {video_url}")
                ydl.download([video_url])
                logging.info(f"Finished download for {video_url}")
        except yt_dlp.utils.DownloadError as e:
            logging.error(f"yt-dlp download failed: {e}")
            return jsonify({"error": f"yt-dlp failed: {e}"}), 500
        except Exception as e:
            logging.error(f"An unexpected error occurred during download: {e}")
            return jsonify({"error": f"An unexpected error occurred during download: {e}"}), 500


        # Check if the file was created
        if not os.path.exists(output_path):
            logging.error(f"Audio file not found after download attempt: {output_path}")
            return jsonify({"error": "Failed to download audio, file not created"}), 500

        logging.info(f"Successfully created audio file: {output_path}")

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
        cleanup_thread = threading.Thread(target=delayed_cleanup, args=(output_path,), daemon=True)
        cleanup_thread.start()

        # Send the file and let the background thread handle cleanup
        return send_file(output_path, as_attachment=True, download_name='audio.mp3', mimetype='audio/mpeg')

    except Exception as e:
        logging.error(f"A general error occurred in get_audio: {e}", exc_info=True)
        # Clean up the file even if sending fails
        if output_path and os.path.exists(output_path):
            logging.info(f"Cleaning up temporary file after error: {output_path}")
            os.remove(output_path)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8675)