# Buttercup Server

Local Python server for downloading video audio using yt-dlp.

## 🚀 Zero-Configuration Installation

**NO manual setup required!** Just download and run.

### Usage

1. **Download** the `buttercup-server` folder
2. **Double-click** `start_server.bat`
3. **Done!** ✨

The script will automatically:
- ✅ Check if Python is installed
- ✅ Download & install Python locally if needed (~15 MB, portable)
- ✅ Create virtual environment
- ✅ Install all dependencies (Flask, flask-cors, yt-dlp)
- ✅ Start the server at `http://localhost:5000`

**No admin rights required. No system-wide installation. Everything stays in this folder.**

---

## First Run Output

```
========================================
 Buttercup Server Startup
========================================

[1/5] Checking for Python...
Python not found - Installing Python automatically...
Downloading Python 3.11.9 embeddable...
Extracting Python...
Enabling pip support...
Installing pip...
OK - Python installed successfully

[2/5] Creating virtual environment...
OK - Virtual environment created

[3/5] Activating virtual environment...
OK - Virtual environment activated

[4/5] Installing dependencies...
OK - All dependencies installed

[5/5] Starting Buttercup Server...
========================================
 Server Ready!
========================================

Server URL: http://localhost:5000
Press Ctrl+C to stop the server
```

**Second run onwards**: Skips download/setup, starts immediately in ~2 seconds.

---

## Requirements

- **Windows 10/11** (any edition)
- **Internet connection** (first run only, to download Python & dependencies)
- **~50 MB disk space** for Python + dependencies

That's it! No manual Python installation needed.

---

## How It Works

### Automatic Setup Process

1. **Python Detection**:
   - First checks if Python is already installed in `python-embedded/` (local)
   - Then checks if Python is installed system-wide
   - If not found: Downloads Python 3.11 embeddable (portable, no admin needed)

2. **First-Time Setup**:
   - Downloads Python embeddable zip (~15 MB)
   - Extracts to `python-embedded/` folder
   - Enables pip support
   - Creates virtual environment in `venv/`
   - Installs Flask, flask-cors, yt-dlp

3. **Subsequent Runs**:
   - Detects existing setup
   - Activates virtual environment
   - Starts server immediately

### Server Endpoint

The server provides a `/get-audio` endpoint that:
1. Accepts a video URL as a parameter
2. Downloads the audio using yt-dlp
3. Returns the audio file to the extension
4. Automatically cleans up temporary files

This is used by the Buttercup Chrome extension to download audio from videos for transcription.

---

## Files & Folders

- `start_server.bat` - **Main script** - Run this!
- `server.py` - Flask server source code
- `requirements.txt` - Python dependencies
- `ffmpeg.exe`, `ffprobe.exe`, `ffplay.exe` - FFmpeg binaries for audio processing
- `python-embedded/` - Auto-downloaded Python installation (created on first run)
- `venv/` - Python virtual environment (created on first run)
- `temp/` - Temporary folder for downloaded audio (auto-created)

---

## Troubleshooting

### "Failed to download Python"
- Check your internet connection
- Make sure Windows Firewall isn't blocking PowerShell
- If download keeps failing, install Python manually from [python.org](https://www.python.org/downloads/)

### Server won't start
- Make sure no other program is using port 5000
- Check that `server.py` exists in the same folder as `start_server.bat`
- Try running as Administrator

### Dependencies fail to install
- Make sure you have an internet connection
- The script will show which dependency failed
- Try deleting the `venv/` folder and running again

---

## Manual Python Installation (Optional)

If you prefer to install Python system-wide:

1. Download Python from [python.org](https://www.python.org/downloads/)
2. During installation, check "Add Python to PATH"
3. Run `start_server.bat` - it will detect system Python and use that instead

---

## Advanced: Manual Setup

If you want to set up manually for development:

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt

# Run server
python server.py
```

---

## Uninstallation

Just delete the entire `buttercup-server` folder. Nothing is installed system-wide.

---

## Why Embeddable Python?

The script uses **Python embeddable** (portable version) because:
- ✅ No admin rights required
- ✅ Doesn't modify system PATH
- ✅ Self-contained in one folder
- ✅ Can be moved anywhere (USB stick, network drive, etc.)
- ✅ Easy to uninstall (just delete folder)
- ✅ Won't conflict with other Python installations

This makes Buttercup Server truly portable and zero-configuration!
