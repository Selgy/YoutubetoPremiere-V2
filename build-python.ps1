# Cross-platform PyInstaller build script
# Works on both Windows and macOS

# Create necessary directories for CEP
if (!(Test-Path "dist\cep\exec")) {
    Write-Host "Creating directory: dist\cep\exec"
    New-Item -Path "dist\cep\exec" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\js")) {
    New-Item -Path "dist\cep\js" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\jsx")) {
    New-Item -Path "dist\cep\jsx" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\exec\sounds")) {
    Write-Host "Creating directory: dist\cep\exec\sounds"
    New-Item -Path "dist\cep\exec\sounds" -ItemType Directory -Force
}

# Create ZXP distribution directories
if (!(Test-Path "dist\zxp\cep\exec")) {
    New-Item -Path "dist\zxp\cep\exec" -ItemType Directory -Force
}
if (!(Test-Path "dist\zxp\cep\js")) {
    New-Item -Path "dist\zxp\cep\js" -ItemType Directory -Force
}
if (!(Test-Path "dist\zxp\cep\jsx")) {
    New-Item -Path "dist\zxp\cep\jsx" -ItemType Directory -Force
}
if (!(Test-Path "dist\zxp\cep\exec\sounds")) {
    New-Item -Path "dist\zxp\cep\exec\sounds" -ItemType Directory -Force
}

# Create src/exec/sounds directory if it doesn't exist
if (!(Test-Path "src\exec\sounds")) {
    Write-Host "Creating src\exec\sounds directory"
    New-Item -Path "src\exec\sounds" -ItemType Directory -Force
}

# Ensure app/sounds directory exists to prevent PyInstaller errors
if (!(Test-Path "app\sounds")) {
    Write-Host "Creating app\sounds directory with placeholder..."
    New-Item -Path "app\sounds" -ItemType Directory -Force
    New-Item -Path "app\sounds\.gitkeep" -ItemType File -Force
}

# Copy static assets that should be part of the CEP extension
Write-Host "Copying static assets to CEP extension directory..."

# Copy src/js if it exists
if (Test-Path "src\js") {
    Write-Host "Copying src\js to dist\cep\js..."
    Copy-Item -Path "src\js\*" -Destination "dist\cep\js\" -Recurse -Force -ErrorAction SilentlyContinue
}

# Copy src/jsx if it exists
if (Test-Path "src\jsx") {
    Write-Host "Copying src\jsx to dist\cep\jsx..."
    Copy-Item -Path "src\jsx\*" -Destination "dist\cep\jsx\" -Recurse -Force -ErrorAction SilentlyContinue
}

# Copy src/exec files if they exist (except sounds which we handle separately)
if (Test-Path "src\exec") {
    Write-Host "Copying src\exec files to dist\cep\exec..."
    Get-ChildItem -Path "src\exec" -File | Copy-Item -Destination "dist\cep\exec\" -Force -ErrorAction SilentlyContinue
}

# Detect OS
$isWindows = $false
$isMacOS = $false

if ($PSVersionTable.Platform -eq "Win32NT" -or $env:OS -like "*Windows*") {
    $isWindows = $true
    Write-Host "Detected Windows OS"
} else {
    $isMacOS = $true
    Write-Host "Detected macOS"
}

# Clean up any existing PyInstaller output
Write-Host "Cleaning up existing PyInstaller output..."
if (Test-Path "dist/YoutubetoPremiere") {
    Remove-Item -Path "dist/YoutubetoPremiere" -Recurse -Force
}
if (Test-Path "build/YoutubetoPremiere") {
    Remove-Item -Path "build/YoutubetoPremiere" -Recurse -Force
}

# Build with PyInstaller
Write-Host "Building with PyInstaller..."

# More aggressive cleanup just before PyInstaller runs
if (Test-Path "dist/YoutubetoPremiere") {
    Write-Host "Removing existing dist/YoutubetoPremiere directory..."
    Remove-Item -Path "dist/YoutubetoPremiere" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "build/YoutubetoPremiere") {
    Write-Host "Removing existing build/YoutubetoPremiere directory..."
    Remove-Item -Path "build/YoutubetoPremiere" -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -Path "dist" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -Path "build/YoutubetoPremiere-work" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null

if ($isWindows) {
    # Create a variable to store additional data parameters
    $dataParams = ""
    
    # Only add sounds if they exist and have actual sound files
    if ((Test-Path "app\sounds") -and (Get-ChildItem -Path "app\sounds" -File -Exclude ".gitkeep" | Measure-Object).Count -gt 0) {
        $dataParams += " --add-data `"app/sounds;exec/sounds`" "
    }
    
    # Windows build command
    pyinstaller --name YoutubetoPremiere --onedir -y --clean `
        --distpath "./dist" `
        --workpath "./build/YoutubetoPremiere-work" `
        $dataParams `
        --add-data "app/*.py;." `
        --hidden-import engineio.async_drivers.threading `
        --hidden-import flask_socketio `
        --hidden-import flask_cors `
        --hidden-import werkzeug `
        --hidden-import yt_dlp `
        --hidden-import psutil `
        --hidden-import requests `
        --hidden-import tqdm `
        --hidden-import curl_cffi `
        --hidden-import python_dotenv `
        --hidden-import eventlet `
        --hidden-import gevent_websocket `
        --hidden-import simple_websocket `
        --hidden-import video_processing `
        --hidden-import utils `
        --hidden-import init `
        --hidden-import routes `
        --collect-all yt_dlp `
        --collect-all flask `
        --collect-all flask_socketio `
        --collect-all flask_cors `
        --collect-all werkzeug `
        --collect-all psutil `
        --collect-all requests `
        --collect-all tqdm `
        --collect-all curl_cffi `
        --collect-all python_dotenv `
        --collect-all eventlet `
        --collect-all gevent_websocket `
        --collect-all simple_websocket `
        app/YoutubetoPremiere.py
} else {
    # For macOS, build a similar command dynamically
    $macCommand = "pyinstaller --name YoutubetoPremiere --onedir -y"
    
    # Only add sounds if they exist and have actual sound files
    if ((Test-Path "app/sounds") -and (Get-ChildItem -Path "app/sounds" -File -Exclude ".gitkeep" | Measure-Object).Count -gt 0) {
        $macCommand += " --add-data 'app/sounds:exec/sounds'"
    }
    
    $macCommand += " --add-data 'app/*.py:.'"
    
    # Add the rest of the parameters
    $macCommand += " --hidden-import engineio.async_drivers.threading --hidden-import flask_socketio"
    $macCommand += " --hidden-import flask_cors --hidden-import werkzeug --hidden-import yt_dlp"
    $macCommand += " --hidden-import psutil --hidden-import requests --hidden-import tqdm"
    $macCommand += " --hidden-import curl_cffi --hidden-import python_dotenv --hidden-import eventlet"
    $macCommand += " --hidden-import gevent_websocket --hidden-import simple_websocket --hidden-import video_processing"
    $macCommand += " --hidden-import utils --hidden-import init --hidden-import routes"
    $macCommand += " --collect-all yt_dlp --collect-all flask --collect-all flask_socketio"
    $macCommand += " --collect-all flask_cors --collect-all werkzeug --collect-all psutil"
    $macCommand += " --collect-all requests --collect-all tqdm --collect-all curl_cffi"
    $macCommand += " --collect-all python_dotenv --collect-all eventlet --collect-all gevent_websocket"
    $macCommand += " --collect-all simple_websocket app/YoutubetoPremiere.py"
    
    # macOS build command - use bash for compatibility
    bash -c $macCommand
}

# Copy the build output to the CEP directory
$executablePaths = @(
    "dist/YoutubetoPremiere/YoutubetoPremiere",
    "dist/YoutubetoPremiere/YoutubetoPremiere.exe",
    "dist/YoutubetoPremiere.exe"
)

$executableCopied = $false
foreach ($exePath in $executablePaths) {
    if (Test-Path $exePath -PathType Leaf) {
        Write-Host "Copying built executable from $exePath to dist/cep/exec"
        Copy-Item -Path $exePath -Destination "dist/cep/exec/" -Force
        $executableCopied = $true
        break
    }
}

if (-not $executableCopied) {
    Write-Host "Error: YoutubetoPremiere executable not found. Searching for it..." -ForegroundColor Yellow
    $foundExecutables = Get-ChildItem -Path "dist" -Recurse -Include "YoutubetoPremiere.exe", "YoutubetoPremiere" -ErrorAction SilentlyContinue
    
    if ($foundExecutables.Count -gt 0) {
        $exePath = $foundExecutables[0].FullName
        Write-Host "Found executable at $exePath, copying to dist/cep/exec" -ForegroundColor Green
        Copy-Item -Path $exePath -Destination "dist/cep/exec/" -Force
    } else {
        Write-Host "Error: YoutubetoPremiere executable not found in dist directory" -ForegroundColor Red
        exit 1
    }
}

# Copy the entire _internal directory if it exists
if (Test-Path "dist/YoutubetoPremiere/_internal" -PathType Container) {
    Write-Host "Copying _internal directory to dist/cep/exec"
    Copy-Item -Path "dist/YoutubetoPremiere/_internal" -Destination "dist/cep/exec/" -Recurse -Force
}

# Copy ffmpeg if available
if ($isWindows) {
    Write-Host "Copying ffmpeg.exe..."
    if (Test-Path "app/ffmpeg.exe") {
        Copy-Item -Path "app/ffmpeg.exe" -Destination "dist/cep/exec/ffmpeg.exe" -Force
    } elseif (Test-Path "ffmpeg/bin/ffmpeg.exe") {
        Copy-Item -Path "ffmpeg/bin/ffmpeg.exe" -Destination "dist/cep/exec/ffmpeg.exe" -Force
    } else {
        Write-Host "Warning: ffmpeg.exe not found" -ForegroundColor Yellow
        # We don't fail the build, as ffmpeg might be installed system-wide or downloaded at runtime
    }
} else {
    # For macOS, we'll handle ffmpeg in the workflow directly
    Write-Host "On macOS, ffmpeg will be handled by the GitHub workflow"
}

# Handle sound files from all potential sources
Write-Host "Handling sound files from all sources..."

# Create sounds directory in exec folder only
New-Item -Path "dist\cep\exec\sounds" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null

# First check app/sounds
if (Test-Path "app\sounds") {
    $soundFiles = Get-ChildItem -Path "app\sounds" -Exclude ".gitkeep" -File
    if ($soundFiles.Count -gt 0) {
        Write-Host "Copying sound files from app\sounds..."
        Copy-Item -Path "app\sounds\*" -Destination "dist\cep\exec\sounds\" -Exclude ".gitkeep" -Force -ErrorAction SilentlyContinue
    }
}

# Then check src/exec/sounds
if (Test-Path "src\exec\sounds") {
    $soundFiles = Get-ChildItem -Path "src\exec\sounds" -File
    if ($soundFiles.Count -gt 0) {
        Write-Host "Copying sound files from src\exec\sounds..."
        Copy-Item -Path "src\exec\sounds\*" -Destination "dist\cep\exec\sounds\" -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "CEP extension files status:"
Get-ChildItem -Path "dist\cep" -Recurse -File | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") }

Write-Host "PyInstaller build completed" 