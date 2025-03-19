# Ensure output directories exist
$execDir = "dist\cep\exec"
if (-not (Test-Path $execDir)) {
    New-Item -ItemType Directory -Force -Path $execDir | Out-Null
    Write-Host "Created directory: $execDir"
}

# For macOS compatibility
# This script will be used on Windows only, but we'll detect
# if we should prepare for cross-platform compatibility
$isMacBuild = $env:BUILD_FOR_MAC -eq "true"
if ($isMacBuild) {
    Write-Host "Preparing for macOS compatibility..." -ForegroundColor Yellow
}

# Step 1: Build with PyInstaller
Write-Host "Building with PyInstaller..."
python -m PyInstaller YoutubetoPremiere.spec --distpath build\YoutubetoPremiere

# Exit if PyInstaller failed
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Step 2: Copy ffmpeg.exe to exec directory
Write-Host "Copying ffmpeg.exe..."
Copy-Item -Path "app\ffmpeg.exe" -Destination "$execDir\ffmpeg.exe" -Force
if (-not $?) {
    Write-Host "Failed to copy ffmpeg.exe" -ForegroundColor Red
    exit 1
}

# Step 3: Copy the built executable
Write-Host "Copying YoutubetoPremiere.exe..."
if (Test-Path "build\YoutubetoPremiere\YoutubetoPremiere.exe") {
    Copy-Item -Path "build\YoutubetoPremiere\YoutubetoPremiere.exe" -Destination "$execDir\YoutubetoPremiere.exe" -Force
    if (-not $?) {
        Write-Host "Failed to copy YoutubetoPremiere.exe" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "YoutubetoPremiere.exe not found in build directory" -ForegroundColor Red
    exit 1
}

# Step 4: Copy Python files
Write-Host "Copying Python source files..."
Get-ChildItem -Path "app\*.py" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$execDir\$($_.Name)" -Force
    if (-not $?) {
        Write-Host "Failed to copy $($_.Name)" -ForegroundColor Red
        exit 1
    }
}

# Step 5: Create sounds directory and copy sounds
$soundsDir = "$execDir\sounds"
if (-not (Test-Path $soundsDir)) {
    New-Item -ItemType Directory -Force -Path $soundsDir | Out-Null
    Write-Host "Created directory: $soundsDir"
}

if (Test-Path "app\sounds") {
    Write-Host "Copying sound files..."
    Copy-Item -Path "app\sounds\*" -Destination "$soundsDir\" -Force -Recurse
}

# Step 6: If building for Mac, create a macOS info file
if ($isMacBuild) {
    $macInfoContent = @"
This extension includes support for macOS.
For macOS users:
1. Make sure ffmpeg is installed on your system
   - Install via Homebrew: brew install ffmpeg
   - Or download from https://ffmpeg.org/download.html
2. The extension will automatically detect your ffmpeg installation
"@

    Set-Content -Path "$execDir\macOS_INFO.txt" -Value $macInfoContent
    Write-Host "Created macOS info file" -ForegroundColor Green
}

Write-Host "Build completed successfully!" -ForegroundColor Green
exit 0 