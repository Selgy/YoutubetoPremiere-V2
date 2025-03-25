# Cross-platform PyInstaller build script
# Works on both Windows and macOS

# Create directory for executables
if (!(Test-Path "dist\cep\exec")) {
    Write-Host "Created directory: dist\cep\exec"
    New-Item -Path "dist\cep\exec" -ItemType Directory -Force
}

# Ensure app/sounds directory exists to prevent PyInstaller errors
if (!(Test-Path "app\sounds")) {
    Write-Host "Creating app\sounds directory with placeholder..."
    New-Item -Path "app\sounds" -ItemType Directory -Force
    New-Item -Path "app\sounds\.gitkeep" -ItemType File -Force
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
    # Windows build command
    pyinstaller --name YoutubetoPremiere --onedir -y --clean `
        --distpath "./dist" `
        --workpath "./build/YoutubetoPremiere-work" `
        --add-data "app/sounds;sounds" `
        --hidden-import engineio.async_drivers.threading `
        app/YoutubetoPremiere.py
} else {
    # macOS build command - use bash for compatibility
    bash -c "pyinstaller --name YoutubetoPremiere --onedir -y --add-data 'app/sounds:sounds' --hidden-import engineio.async_drivers.threading app/YoutubetoPremiere.py"
}

# Copy the build output to the CEP directory
if (Test-Path "dist/YoutubetoPremiere/YoutubetoPremiere" -PathType Leaf) {
    Write-Host "Copying built executable to dist/cep/exec"
    Copy-Item -Path "dist/YoutubetoPremiere/YoutubetoPremiere" -Destination "dist/cep/exec/" -Force
} elseif (Test-Path "dist/YoutubetoPremiere/YoutubetoPremiere.exe" -PathType Leaf) {
    Write-Host "Copying built executable to dist/cep/exec"
    Copy-Item -Path "dist/YoutubetoPremiere/YoutubetoPremiere.exe" -Destination "dist/cep/exec/" -Force
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

Write-Host "PyInstaller build completed" 