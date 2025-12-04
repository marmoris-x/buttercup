import os
import uuid
import logging
import io
import time
import threading
import subprocess
import math
import re
from flask import Flask, request, send_file, jsonify, after_this_request
from flask_cors import CORS
import yt_dlp
import requests

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Helper function to mask sensitive data in logs
def mask_sensitive_data(text):
    """Mask API keys and other sensitive data in log messages"""
    if not text:
        return text
    # Mask Groq API keys (format: gsk_...)
    text = re.sub(r'(groqApiKey=)gsk_[a-zA-Z0-9]+', r'\1***MASKED***', text)
    # Mask other API keys (generic pattern)
    text = re.sub(r'([&?]api[_-]?key=)[^&\s]+', r'\1***MASKED***', text, flags=re.IGNORECASE)
    return text

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
            'extractor_args': {
                'youtube': {
                    'player_client': ['default']  # Fixes "No JavaScript runtime" warning
                }
            }
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

@app.route('/api/upload-transcribe', methods=['POST'])
def upload_transcribe():
    """
    Handle local file upload and transcription using ffmpeg + Groq API
    Optimized to use compressed MP3 format to minimize API calls
    """
    logging.info("Received upload transcription request")

    # Check if file was uploaded
    if 'file' not in request.files:
        logging.error("No file in request")
        return jsonify({"error": "No file uploaded"}), 400

    uploaded_file = request.files['file']
    if uploaded_file.filename == '':
        logging.error("Empty filename")
        return jsonify({"error": "Empty filename"}), 400

    # Get API settings from request (including advanced settings)
    groq_api_key = request.form.get('groqApiKey')
    groq_model = request.form.get('groqModel', 'whisper-large-v3-turbo')
    language = request.form.get('language', 'auto')
    temperature = request.form.get('temperature', '0')
    response_format = request.form.get('responseFormat', 'verbose_json')
    prompt = request.form.get('prompt', '')  # Model prompting for better accuracy
    use_word_timestamps = request.form.get('useWordTimestamps', 'true').lower() == 'true'  # Word-level timestamps

    if not groq_api_key:
        logging.error("No Groq API key provided")
        return jsonify({"error": "Groq API key is required"}), 400

    logging.info(f"Transcription settings - Model: {groq_model}, Language: {language}, Temp: {temperature}, Format: {response_format}, Prompt: {'Yes' if prompt else 'No'}, WordTimestamps: {use_word_timestamps}")

    input_file = None
    audio_file = None

    try:
        # Save uploaded file to temp directory
        unique_id = str(uuid.uuid4())
        file_ext = os.path.splitext(uploaded_file.filename)[1]
        input_file = os.path.join(TEMP_DIR, f"{unique_id}_input{file_ext}")
        uploaded_file.save(input_file)

        input_size = os.path.getsize(input_file)
        logging.info(f"Saved uploaded file: {input_file} ({input_size / 1024 / 1024:.2f} MB)")

        # Extract/convert audio to MP3 using ffmpeg
        # Strategy: Use 128kbps MP3 for excellent speech quality with small size
        # ~1MB per minute of audio - fits most videos in single API call
        audio_file = os.path.join(TEMP_DIR, f"{unique_id}_audio.mp3")

        ffmpeg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg.exe')

        # ffmpeg command: extract audio, convert to MP3 128kbps, mono (speech recognition doesn't need stereo)
        ffmpeg_cmd = [
            ffmpeg_path,
            '-i', input_file,
            '-vn',  # No video
            '-acodec', 'libmp3lame',  # MP3 codec
            '-b:a', '128k',  # 128kbps bitrate (good quality, small size)
            '-ac', '1',  # Mono (speech recognition doesn't benefit from stereo)
            '-ar', '16000',  # 16kHz sample rate (Whisper's native rate, smaller file)
            '-y',  # Overwrite output file
            audio_file
        ]

        logging.info(f"Running ffmpeg: {' '.join(ffmpeg_cmd)}")
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )

        if result.returncode != 0:
            logging.error(f"ffmpeg failed: {result.stderr}")
            return jsonify({"error": f"Audio extraction failed: {result.stderr}"}), 500

        if not os.path.exists(audio_file):
            logging.error("Audio file not created by ffmpeg")
            return jsonify({"error": "Failed to extract audio"}), 500

        audio_size = os.path.getsize(audio_file)
        logging.info(f"Extracted audio: {audio_file} ({audio_size / 1024 / 1024:.2f} MB)")

        # Get audio duration for chunking calculation
        duration = get_audio_duration(ffmpeg_path, audio_file)
        logging.info(f"Audio duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")

        # Check if we need to chunk (25MB API limit, use 24MB for safety)
        MAX_FILE_SIZE_MB = 24
        audio_size_mb = audio_size / 1024 / 1024

        if audio_size_mb < MAX_FILE_SIZE_MB:
            # Single file transcription
            logging.info(f"Audio is {audio_size_mb:.2f}MB - sending as single file")
            transcript = transcribe_audio_file(audio_file, groq_api_key, groq_model, language, temperature, response_format, prompt, use_word_timestamps)
        else:
            # Need to chunk - calculate optimal chunk duration
            logging.info(f"Audio is {audio_size_mb:.2f}MB - chunking required")
            mb_per_second = audio_size_mb / duration
            chunk_duration = math.floor(MAX_FILE_SIZE_MB / mb_per_second)
            num_chunks = math.ceil(duration / chunk_duration)

            logging.info(f"Splitting into {num_chunks} chunks ({chunk_duration}s each, {mb_per_second:.3f}MB/s)")

            # Split and transcribe chunks
            transcripts = []
            for i in range(num_chunks):
                start_time = i * chunk_duration
                chunk_file = os.path.join(TEMP_DIR, f"{unique_id}_chunk_{i}.mp3")

                # Extract chunk using ffmpeg
                chunk_cmd = [
                    ffmpeg_path,
                    '-i', audio_file,
                    '-ss', str(start_time),
                    '-t', str(chunk_duration),
                    '-acodec', 'copy',  # Copy codec (no re-encoding, fast!)
                    '-y',
                    chunk_file
                ]

                logging.info(f"Extracting chunk {i+1}/{num_chunks}")
                subprocess.run(chunk_cmd, capture_output=True, timeout=60)

                chunk_size = os.path.getsize(chunk_file) / 1024 / 1024
                logging.info(f"Chunk {i+1}: {chunk_size:.2f}MB")

                # Transcribe chunk
                chunk_result = transcribe_audio_file(chunk_file, groq_api_key, groq_model, language, temperature, response_format, prompt, use_word_timestamps)
                transcripts.append({'result': chunk_result, 'startTime': start_time})

                # Clean up chunk file
                os.remove(chunk_file)

            # Merge transcripts
            transcript = merge_transcripts(transcripts)

        logging.info("Transcription completed successfully")

        # Return transcript
        return jsonify({
            "success": True,
            "transcript": transcript,
            "audioSize": audio_size,
            "duration": duration
        })

    except subprocess.TimeoutExpired:
        logging.error("ffmpeg timed out")
        return jsonify({"error": "Audio processing timed out"}), 500
    except requests.RequestException as e:
        logging.error(f"Groq API request failed: {e}")
        return jsonify({"error": f"Transcription API failed: {str(e)}"}), 500
    except Exception as e:
        logging.error(f"Upload transcription failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        # Clean up temp files
        if input_file and os.path.exists(input_file):
            try:
                os.remove(input_file)
                logging.info(f"Cleaned up input file: {input_file}")
            except Exception as e:
                logging.warning(f"Could not remove input file: {e}")

        if audio_file and os.path.exists(audio_file):
            try:
                os.remove(audio_file)
                logging.info(f"Cleaned up audio file: {audio_file}")
            except Exception as e:
                logging.warning(f"Could not remove audio file: {e}")


def get_audio_duration(ffmpeg_path, audio_file):
    """Get audio duration in seconds using ffprobe"""
    ffprobe_path = ffmpeg_path.replace('ffmpeg.exe', 'ffprobe.exe')
    cmd = [
        ffprobe_path,
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audio_file
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    return float(result.stdout.strip())


def transcribe_audio_file(audio_file, api_key, model, language, temperature, response_format, prompt='', use_word_timestamps=True, translate=False):
    """Send audio file to Groq API for transcription/translation with optional prompt and timestamp granularities

    Args:
        audio_file: Path to audio file
        api_key: Groq API key
        model: Model name
        language: Language code or 'auto'
        temperature: Temperature setting (0-1)
        response_format: Response format (verbose_json, etc.)
        prompt: Optional prompt for better accuracy
        use_word_timestamps: Whether to request word-level timestamps (default: True)
        translate: Whether to translate to English (default: False)
    """
    # Use translations endpoint if translate=True, otherwise use transcriptions
    if translate:
        url = 'https://api.groq.com/openai/v1/audio/translations'
        logging.info(f"Using translation endpoint (translate to English)")
    else:
        url = 'https://api.groq.com/openai/v1/audio/transcriptions'

    with open(audio_file, 'rb') as f:
        files = {'file': (os.path.basename(audio_file), f, 'audio/mpeg')}
        data = {
            'model': model,
            'response_format': response_format,
            'temperature': temperature
        }

        if language and language != 'auto':
            data['language'] = language

        # Add prompt if provided (helps guide model for better accuracy)
        if prompt and prompt.strip():
            data['prompt'] = prompt.strip()
            logging.info(f"Using prompt: {prompt[:50]}..." if len(prompt) > 50 else f"Using prompt: {prompt}")

        # Add timestamp granularities for verbose_json format
        # This matches the web transcription behavior for consistent segment lengths
        if response_format == 'verbose_json':
            # Note: requests library requires special handling for array parameters
            # We need to send timestamp_granularities[] as separate entries
            data['timestamp_granularities[]'] = 'segment'

            # If word timestamps are enabled, we need to send both segment and word
            # However, requests.post with 'data' dict cannot handle duplicate keys
            # So we need to use a list of tuples instead
            if use_word_timestamps:
                # Remove the single entry and rebuild with both values
                del data['timestamp_granularities[]']
                # We'll add these as part of the data list below
                logging.info(f"Requesting timestamp granularities: segment + word")
            else:
                logging.info(f"Requesting timestamp granularities: segment only")

        headers = {'Authorization': f'Bearer {api_key}'}

        logging.info(f"Sending to Groq API: {os.path.basename(audio_file)}")

        # If we need word timestamps, convert data dict to list of tuples to allow duplicate keys
        if response_format == 'verbose_json' and use_word_timestamps:
            data_list = [(k, v) for k, v in data.items()]
            data_list.append(('timestamp_granularities[]', 'segment'))
            data_list.append(('timestamp_granularities[]', 'word'))
            response = requests.post(url, headers=headers, files=files, data=data_list, timeout=300)
        else:
            response = requests.post(url, headers=headers, files=files, data=data, timeout=300)

        if response.status_code != 200:
            error_msg = response.text
            logging.error(f"Groq API error: {error_msg}")
            raise Exception(f"Groq API error ({response.status_code}): {error_msg}")

        return response.json()


def convert_groq_to_youtube_format(groq_result):
    """Convert Groq API response to YouTube caption format

    Args:
        groq_result: Groq API response with segments/words

    Returns:
        Dict with 'events' key containing YouTube-formatted captions
    """
    events = []

    # Check if we have segments (verbose_json format)
    if 'segments' in groq_result and groq_result['segments']:
        for segment in groq_result['segments']:
            events.append({
                'tStartMs': int(segment['start'] * 1000),
                'dDurationMs': int((segment['end'] - segment['start']) * 1000),
                'segs': [{'utf8': segment['text']}]
            })
    elif 'text' in groq_result:
        # Fallback for non-verbose format (single event)
        events.append({
            'tStartMs': 0,
            'dDurationMs': 5000,
            'segs': [{'utf8': groq_result['text']}]
        })

    return {'events': events}


def merge_transcripts(transcripts):
    """Merge multiple transcript chunks with correct time offsets

    Args:
        transcripts: List of dicts with 'result' and 'startTime' keys

    Returns:
        Dict with 'events' key containing merged transcript segments
    """
    events = []

    for item in transcripts:
        result = item['result']
        start_time = item['startTime']

        if 'segments' in result:
            for segment in result['segments']:
                events.append({
                    'tStartMs': int((segment['start'] + start_time) * 1000),
                    'dDurationMs': int((segment['end'] - segment['start']) * 1000),
                    'segs': [{'utf8': segment['text']}]
                })
        elif 'text' in result:
            # Fallback for non-verbose format
            events.append({
                'tStartMs': int(start_time * 1000),
                'dDurationMs': 5000,
                'segs': [{'utf8': result['text']}]
            })

    return {'events': events}


@app.route('/transcribe-video', methods=['GET'])
def transcribe_video():
    """
    Download video, extract audio, chunk if needed, and transcribe
    Optimized for M4A format to minimize file size

    Query Parameters:
        url: Video URL (required)
        groqApiKey: Groq API key (required)
        groqModel: Model name (default: whisper-large-v3-turbo)
        language: Language code or 'auto' (default: auto)
        temperature: Temperature 0-1 (default: 0)
        responseFormat: Response format (default: verbose_json)
        prompt: Optional prompt for better accuracy
        useWordTimestamps: Whether to use word-level timestamps (default: true)
        translate: Whether to translate to English (default: false)
    """
    video_url = request.args.get('url')
    groq_api_key = request.args.get('groqApiKey')
    groq_model = request.args.get('groqModel', 'whisper-large-v3-turbo')
    language = request.args.get('language', 'auto')
    temperature = request.args.get('temperature', '0')
    response_format = request.args.get('responseFormat', 'verbose_json')
    prompt = request.args.get('prompt', '')
    use_word_timestamps = request.args.get('useWordTimestamps', 'true').lower() == 'true'
    translate = request.args.get('translate', 'false').lower() == 'true'

    # Log request with masked API key
    masked_request = mask_sensitive_data(request.url)
    logging.info(f"[TranscribeVideo] Request: {masked_request}")
    logging.info(f"[TranscribeVideo] Video URL: {video_url}")
    logging.info(f"[TranscribeVideo] Settings - Model: {groq_model}, Language: {language}, Temp: {temperature}, WordTimestamps: {use_word_timestamps}, Translate: {translate}")

    # Validate required parameters
    if not video_url:
        logging.error("[TranscribeVideo] URL parameter is missing")
        return jsonify({"error": "URL parameter is required"}), 400

    if not groq_api_key:
        logging.error("[TranscribeVideo] Groq API key is missing")
        return jsonify({"error": "Groq API key is required"}), 400

    downloaded_audio = None
    converted_audio = None

    try:
        # Step 1: Download audio using yt-dlp
        unique_id = str(uuid.uuid4())
        base_path = os.path.join(TEMP_DIR, unique_id)

        # Download in best audio quality first (we'll convert to M4A)
        # Using 'bestaudio' ensures good quality source for conversion
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': base_path + '.%(ext)s',
            'quiet': False,
            'no_warnings': False,
            'extractor_args': {
                'youtube': {
                    'player_client': ['default']  # Fixes "No JavaScript runtime" warning
                }
            }
        }

        logging.info(f"[TranscribeVideo] Step 1: Downloading audio from {video_url}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)

                # Get the actual downloaded file path
                if 'requested_downloads' in info and info['requested_downloads']:
                    downloaded_audio = info['requested_downloads'][0]['filepath']
                else:
                    # Fallback: find the file with our unique ID
                    for ext in ['webm', 'm4a', 'ogg', 'opus', 'mp3', 'mp4', 'wav']:
                        potential_file = f"{base_path}.{ext}"
                        if os.path.exists(potential_file):
                            downloaded_audio = potential_file
                            break

        except yt_dlp.utils.DownloadError as e:
            logging.error(f"[TranscribeVideo] yt-dlp download failed: {e}")
            return jsonify({"error": f"Video download failed: {str(e)}"}), 500

        if not downloaded_audio or not os.path.exists(downloaded_audio):
            logging.error(f"[TranscribeVideo] Audio file not found after download")
            return jsonify({"error": "Failed to download audio"}), 500

        download_size = os.path.getsize(downloaded_audio)
        logging.info(f"[TranscribeVideo] Downloaded: {downloaded_audio} ({download_size / 1024 / 1024:.2f} MB)")

        # Step 2: Convert to M4A (AAC codec) with optimized settings for speech
        # M4A provides ~30-40% better compression than MP3 at same quality
        converted_audio = os.path.join(TEMP_DIR, f"{unique_id}_audio.m4a")

        ffmpeg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg.exe')

        logging.info(f"[TranscribeVideo] Step 2: Converting to M4A (AAC) format")

        # ffmpeg command: convert to M4A with AAC codec
        # -b:a 128k: 128kbps bitrate (excellent for speech, ~1MB per minute)
        # -ac 1: Mono (speech recognition doesn't benefit from stereo)
        # -ar 16000: 16kHz sample rate (Whisper's native rate)
        convert_cmd = [
            ffmpeg_path,
            '-i', downloaded_audio,
            '-vn',  # No video
            '-acodec', 'aac',  # AAC codec (M4A)
            '-b:a', '128k',  # 128kbps bitrate
            '-ac', '1',  # Mono
            '-ar', '16000',  # 16kHz sample rate
            '-y',  # Overwrite output file
            converted_audio
        ]

        logging.info(f"[TranscribeVideo] Running: {' '.join(convert_cmd)}")
        result = subprocess.run(
            convert_cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout for conversion
        )

        if result.returncode != 0:
            logging.error(f"[TranscribeVideo] FFmpeg conversion failed: {result.stderr}")
            return jsonify({"error": f"Audio conversion failed: {result.stderr}"}), 500

        if not os.path.exists(converted_audio):
            logging.error("[TranscribeVideo] Converted audio file not created")
            return jsonify({"error": "Audio conversion failed"}), 500

        audio_size = os.path.getsize(converted_audio)
        logging.info(f"[TranscribeVideo] Converted to M4A: {audio_size / 1024 / 1024:.2f} MB (was {download_size / 1024 / 1024:.2f} MB)")

        # Step 3: Get audio duration for chunking decision
        duration = get_audio_duration(ffmpeg_path, converted_audio)
        logging.info(f"[TranscribeVideo] Audio duration: {duration:.2f} seconds ({duration/60:.2f} minutes)")

        # Step 4: Decide if chunking is needed (25MB API limit, use 24MB for safety)
        MAX_FILE_SIZE_MB = 24
        audio_size_mb = audio_size / 1024 / 1024

        if audio_size_mb < MAX_FILE_SIZE_MB:
            # Single file transcription
            logging.info(f"[TranscribeVideo] Audio is {audio_size_mb:.2f}MB - sending as single file")
            groq_result = transcribe_audio_file(
                converted_audio,
                groq_api_key,
                groq_model,
                language,
                temperature,
                response_format,
                prompt,
                use_word_timestamps,
                translate
            )
            # Convert Groq API response to YouTube format
            transcript = convert_groq_to_youtube_format(groq_result)
        else:
            # Chunking required
            logging.info(f"[TranscribeVideo] Audio is {audio_size_mb:.2f}MB - chunking required")

            # Calculate optimal chunk duration
            mb_per_second = audio_size_mb / duration
            chunk_duration = math.floor(MAX_FILE_SIZE_MB / mb_per_second)
            num_chunks = math.ceil(duration / chunk_duration)

            logging.info(f"[TranscribeVideo] Splitting into {num_chunks} chunks ({chunk_duration}s each, {mb_per_second:.3f}MB/s)")

            # Split and transcribe chunks
            transcripts = []
            for i in range(num_chunks):
                start_time = i * chunk_duration
                chunk_file = os.path.join(TEMP_DIR, f"{unique_id}_chunk_{i}.m4a")

                logging.info(f"[TranscribeVideo] Processing chunk {i+1}/{num_chunks} (start: {start_time}s)")

                # Extract chunk using ffmpeg
                chunk_cmd = [
                    ffmpeg_path,
                    '-i', converted_audio,
                    '-ss', str(start_time),  # Start time
                    '-t', str(chunk_duration),  # Duration
                    '-acodec', 'copy',  # Copy codec (no re-encoding, fast!)
                    '-y',
                    chunk_file
                ]

                logging.info(f"[TranscribeVideo] Extracting chunk {i+1}/{num_chunks}")
                subprocess.run(chunk_cmd, capture_output=True, timeout=60)

                if not os.path.exists(chunk_file):
                    logging.error(f"[TranscribeVideo] Chunk {i+1} file not created")
                    raise Exception(f"Failed to create chunk {i+1}")

                chunk_size = os.path.getsize(chunk_file) / 1024 / 1024
                logging.info(f"[TranscribeVideo] Chunk {i+1}: {chunk_size:.2f}MB")

                # Transcribe chunk
                chunk_result = transcribe_audio_file(
                    chunk_file,
                    groq_api_key,
                    groq_model,
                    language,
                    temperature,
                    response_format,
                    prompt,
                    use_word_timestamps,
                    translate
                )
                transcripts.append({'result': chunk_result, 'startTime': start_time})

                # Clean up chunk file immediately
                try:
                    os.remove(chunk_file)
                    logging.info(f"[TranscribeVideo] Cleaned up chunk {i+1} file")
                except Exception as e:
                    logging.warning(f"[TranscribeVideo] Could not remove chunk file: {e}")

            # Merge all transcripts with correct time offsets
            logging.info(f"[TranscribeVideo] Merging {len(transcripts)} chunk transcripts")
            transcript = merge_transcripts(transcripts)

        logging.info("[TranscribeVideo] Transcription completed successfully")

        # Return transcript result
        return jsonify({
            "success": True,
            "transcript": transcript,
            "audioSize": audio_size,
            "duration": duration,
            "chunked": audio_size_mb >= MAX_FILE_SIZE_MB,
            "numChunks": math.ceil(duration / chunk_duration) if audio_size_mb >= MAX_FILE_SIZE_MB else 1
        })

    except subprocess.TimeoutExpired:
        logging.error("[TranscribeVideo] FFmpeg operation timed out")
        return jsonify({"error": "Audio processing timed out"}), 500
    except requests.RequestException as e:
        logging.error(f"[TranscribeVideo] Groq API request failed: {e}")
        return jsonify({"error": f"Transcription API failed: {str(e)}"}), 500
    except Exception as e:
        logging.error(f"[TranscribeVideo] Transcription failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
    finally:
        # Clean up temporary files
        if downloaded_audio and os.path.exists(downloaded_audio):
            try:
                os.remove(downloaded_audio)
                logging.info(f"[TranscribeVideo] Cleaned up downloaded audio: {downloaded_audio}")
            except Exception as e:
                logging.warning(f"[TranscribeVideo] Could not remove downloaded audio: {e}")

        if converted_audio and os.path.exists(converted_audio):
            try:
                os.remove(converted_audio)
                logging.info(f"[TranscribeVideo] Cleaned up converted audio: {converted_audio}")
            except Exception as e:
                logging.warning(f"[TranscribeVideo] Could not remove converted audio: {e}")


@app.route('/extract-playlist', methods=['GET'])
def extract_playlist():
    """Extract all video URLs from a playlist

    Supports:
    - YouTube playlists
    - Vimeo showcases/channels
    - Other platforms supported by yt-dlp

    Query parameters:
        url: Playlist URL

    Returns:
        {
            "success": true,
            "playlist_title": "Playlist Title",
            "playlist_url": "https://...",
            "video_count": 10,
            "videos": [
                {
                    "url": "https://www.youtube.com/watch?v=...",
                    "title": "Video Title",
                    "duration": 123,
                    "id": "video_id"
                },
                ...
            ]
        }
    """
    playlist_url = request.args.get('url')

    logging.info(f"[ExtractPlaylist] Received request for playlist: {playlist_url}")

    if not playlist_url:
        logging.error("[ExtractPlaylist] URL parameter is missing")
        return jsonify({"error": "URL parameter is required"}), 400

    try:
        # Configure yt-dlp to extract playlist info without downloading
        ydl_opts = {
            'extract_flat': 'in_playlist',  # Only extract video URLs, don't download
            'quiet': False,
            'no_warnings': False,
            'ignoreerrors': True,  # Continue on errors
            'extractor_args': {
                'youtube': {
                    'player_client': ['default']  # Fixes "No JavaScript runtime" warning
                }
            }
        }

        logging.info(f"[ExtractPlaylist] Extracting playlist info for: {playlist_url}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(playlist_url, download=False)

                if not info:
                    logging.error("[ExtractPlaylist] Failed to extract playlist info - yt-dlp returned None")
                    return jsonify({"error": "Failed to extract playlist information"}), 500

                logging.info(f"[ExtractPlaylist] Got info, checking for entries...")
                logging.info(f"[ExtractPlaylist] Info keys: {list(info.keys())}")

                # Check if this is a playlist
                if 'entries' not in info:
                    logging.error(f"[ExtractPlaylist] URL is not a playlist - no 'entries' key found")
                    logging.error(f"[ExtractPlaylist] Available keys: {list(info.keys())}")
                    return jsonify({"error": "URL does not appear to be a playlist"}), 400

                entries_count = len(info['entries']) if info['entries'] else 0
                logging.info(f"[ExtractPlaylist] Found {entries_count} entries in playlist")

                # Extract video information
                videos = []
                for i, entry in enumerate(info['entries']):
                    if entry is None:
                        logging.warning(f"[ExtractPlaylist] Entry {i} is None, skipping")
                        continue  # Skip unavailable videos

                    try:
                        # Build video URL
                        video_id = entry.get('id')
                        video_url = entry.get('url') or entry.get('webpage_url')

                        logging.debug(f"[ExtractPlaylist] Processing entry {i}: id={video_id}, url={video_url}")

                        # If no direct URL, construct YouTube URL from ID
                        if not video_url and video_id:
                            # Determine platform
                            extractor = info.get('extractor', '').lower()
                            if 'youtube' in extractor:
                                video_url = f"https://www.youtube.com/watch?v={video_id}"
                                logging.debug(f"[ExtractPlaylist] Constructed YouTube URL: {video_url}")
                            else:
                                # For other platforms, try to use the original URL format
                                video_url = entry.get('ie_key', video_id)
                                logging.debug(f"[ExtractPlaylist] Using ie_key as URL: {video_url}")

                        if not video_url:
                            logging.warning(f"[ExtractPlaylist] No URL found for entry {i}, skipping")
                            continue

                        video_info = {
                            'url': video_url,
                            'title': entry.get('title', 'Unknown Title'),
                            'duration': entry.get('duration', 0),
                            'id': video_id
                        }

                        videos.append(video_info)
                        logging.debug(f"[ExtractPlaylist] ✓ Added video: {video_info['title']}")

                    except Exception as e:
                        logging.warning(f"[ExtractPlaylist] Error processing entry {i}: {e}")
                        continue

                logging.info(f"[ExtractPlaylist] Successfully extracted {len(videos)} videos from playlist")

                result = {
                    'success': True,
                    'playlist_title': info.get('title', 'Unknown Playlist'),
                    'playlist_url': playlist_url,
                    'video_count': len(videos),
                    'videos': videos,
                    'platform': info.get('extractor', 'unknown')
                }

                return jsonify(result), 200

        except KeyError as e:
            logging.error(f"[ExtractPlaylist] KeyError while processing playlist: {e}", exc_info=True)
            return jsonify({"error": f"Playlist structure error: {str(e)}"}), 500

    except yt_dlp.utils.DownloadError as e:
        logging.error(f"[ExtractPlaylist] yt-dlp download error: {e}")
        return jsonify({"error": f"Failed to extract playlist: {str(e)}"}), 500
    except Exception as e:
        logging.error(f"[ExtractPlaylist] Unexpected error: {e}", exc_info=True)
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8675)