@echo off
REM ===================================================================
REM Buttercup Server - Fully Automatic Setup & Start Script
REM Works on ANY fresh Windows PC - installs Python if needed!
REM ===================================================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo  Buttercup Server Startup
echo ========================================
echo.

REM Get the directory where this batch file is located
cd /d "%~dp0"

REM ===================================================================
REM STEP 1: Check for Python and install if needed
REM ===================================================================

echo [1/5] Checking for Python...

REM First check if we have a local Python installation
if exist "python-embedded\python.exe" (
    echo OK - Using local Python installation
    set "PYTHON_CMD=%~dp0python-embedded\python.exe"
    set "PIP_CMD=%~dp0python-embedded\Scripts\pip.exe"
    goto :python_found
)

REM Check if Python is installed system-wide
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo OK - Python found in system PATH
    set "PYTHON_CMD=python"
    set "PIP_CMD=python -m pip"
    goto :python_found
)

REM Python not found - install it automatically
echo.
echo Python not found - Installing Python automatically...
echo This will download Python 3.11 embeddable (portable, ~15 MB)
echo No admin rights required, installs locally to this folder.
echo.

REM Create temp directory if needed
if not exist "temp" mkdir temp

REM Download Python embeddable (Windows x64)
echo Downloading Python 3.11.9 embeddable (15 MB)...
echo Please wait, this may take 30-60 seconds...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip' -OutFile 'temp\python-embed.zip' -UseBasicParsing}"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to download Python!
    echo.
    echo Possible reasons:
    echo - No internet connection
    echo - Firewall blocking PowerShell
    echo - Download server unavailable
    echo.
    echo You can install Python manually from: https://www.python.org/downloads/
    echo.
    goto :error_exit
)

echo OK - Downloaded successfully
echo.

echo Extracting Python...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path 'temp\python-embed.zip' -DestinationPath 'python-embedded' -Force"
if %errorlevel% neq 0 (
    echo ERROR: Failed to extract Python!
    goto :error_exit
)

REM Clean up download
del temp\python-embed.zip >nul 2>&1

echo OK - Extracted successfully
echo.

REM Enable pip in embedded Python by uncommenting import site
echo Configuring Python for pip support...
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content 'python-embedded\python311._pth') -replace '#import site', 'import site' | Set-Content 'python-embedded\python311._pth'"

REM Download and install pip
echo Installing pip (package manager)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'temp\get-pip.py' -UseBasicParsing"
if %errorlevel% neq 0 (
    echo ERROR: Failed to download pip installer!
    goto :error_exit
)

python-embedded\python.exe temp\get-pip.py --no-warn-script-location --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install pip!
    goto :error_exit
)

del temp\get-pip.py >nul 2>&1

echo OK - Python installed successfully
echo.

set "PYTHON_CMD=%~dp0python-embedded\python.exe"
set "PIP_CMD=%~dp0python-embedded\Scripts\pip.exe"

:python_found
echo.

REM ===================================================================
REM STEP 2: Check if virtual environment exists, create if not
REM ===================================================================

if not exist "venv\" (
    echo [2/5] Creating virtual environment...
    "%PYTHON_CMD%" -m venv venv
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment!
        echo.
        echo This usually happens if:
        echo - Python installation is corrupted
        echo - Not enough disk space
        echo.
        goto :error_exit
    )
    echo OK - Virtual environment created
    echo.
) else (
    echo [2/5] Virtual environment already exists
    echo.
)

REM ===================================================================
REM STEP 3: Activate virtual environment
REM ===================================================================

echo [3/5] Activating virtual environment...

if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment is corrupted!
    echo.
    echo Try deleting the 'venv' folder and running this script again.
    echo.
    goto :error_exit
)

call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo ERROR: Failed to activate virtual environment!
    goto :error_exit
)

echo OK - Virtual environment activated
echo.

REM ===================================================================
REM STEP 4: Install/update requirements
REM ===================================================================

echo [4/5] Installing dependencies (Flask, yt-dlp, etc.)...

if not exist "requirements.txt" (
    echo ERROR: requirements.txt not found!
    echo Make sure all files are in the buttercup-server folder.
    goto :error_exit
)

REM Upgrade pip first (suppress output for speed)
python -m pip install --upgrade pip --quiet --disable-pip-version-check >nul 2>&1

REM Install requirements with progress
echo Installing: Flask, flask-cors, yt-dlp...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check --no-cache-dir

if %errorlevel% neq 0 (
    echo.
    echo WARNING: Some dependencies may not have installed correctly
    echo Trying again with verbose output...
    echo.
    python -m pip install -r requirements.txt --disable-pip-version-check
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install dependencies!
        echo Check your internet connection and try again.
        goto :error_exit
    )
)

echo OK - All dependencies installed
echo.

REM ===================================================================
REM STEP 5: Start the server
REM ===================================================================

echo [5/5] Starting Buttercup Server...
echo.
echo ========================================
echo  Server Ready!
echo ========================================
echo.
echo Server URL: http://localhost:8675
echo.
echo The Buttercup Chrome extension can now download audio from videos.
echo Press Ctrl+C to stop the server.
echo.
echo --------------------------------------------

REM Check if server.py exists
if not exist "server.py" (
    echo.
    echo ERROR: server.py not found!
    echo Make sure all files are in the buttercup-server folder.
    echo.
    goto :error_exit
)

REM Start the server
python server.py

REM If we get here, server stopped (either by user or error)
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo  Server stopped with errors!
    echo ========================================
    echo.
    echo Error code: %errorlevel%
    echo.
    goto :error_exit
)

REM Normal exit
echo.
echo Server stopped normally.
pause
exit /b 0

:error_exit
REM Error exit - keep window open
echo.
echo ========================================
echo  An error occurred!
echo ========================================
echo.
echo Location: buttercup-server folder
echo.
echo Troubleshooting:
echo 1. Make sure you have internet connection
echo 2. Try running as Administrator
echo 3. Delete 'venv' and 'python-embedded' folders and try again
echo 4. Check that all files are present in the folder
echo.
echo Press any key to exit...
pause >nul
exit /b 1
