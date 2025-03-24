# Create necessary directories
Write-Host "Created directory: dist\cep\exec"
New-Item -Path "dist\cep\exec" -ItemType Directory -Force | Out-Null

# Check if we should skip Python build
if ($env:SKIP_PYTHON_BUILD -eq "true" -or $env:NO_PYTHON -eq "true") {
    Write-Host "Skipping Python build as SKIP_PYTHON_BUILD or NO_PYTHON is set to true"
    
    # Only copy Python files if SKIP_FILE_COPY is not set
    if ($env:SKIP_FILE_COPY -ne "true") {
        Write-Host "Copying Python source files..."
        Copy-Item -Path "app\*.py" -Destination "dist\cep\exec\" -Force
        New-Item -Path "dist\cep\exec\sounds" -ItemType Directory -Force | Out-Null
        Write-Host "Created directory: dist\cep\exec\sounds"
    } else {
        Write-Host "Skipping file copy as SKIP_FILE_COPY is set to true"
    }
    
    # Check if we have executables in build/executables (used in GitHub Actions)
    if (Test-Path "build\executables\YoutubetoPremiere.exe") {
        Write-Host "Found pre-built executable in build\executables, copying..."
        Copy-Item -Path "build\executables\YoutubetoPremiere.exe" -Destination "dist\cep\exec\YoutubetoPremiere.exe" -Force
        Write-Host "Copied Windows executable"
    }
    
    if (Test-Path "build\executables\YoutubetoPremiere") {
        Write-Host "Found pre-built macOS executable, copying..."
        Copy-Item -Path "build\executables\YoutubetoPremiere" -Destination "dist\cep\exec\YoutubetoPremiere" -Force
        Write-Host "Copied macOS executable"
    }
    
    if (Test-Path "build\executables\ffmpeg.exe") {
        Write-Host "Copying ffmpeg.exe from build\executables..."
        Copy-Item -Path "build\executables\ffmpeg.exe" -Destination "dist\cep\exec\ffmpeg.exe" -Force
        Write-Host "Copied Windows ffmpeg"
    }
    
    if (Test-Path "build\executables\ffmpeg") {
        Write-Host "Copying ffmpeg from build\executables..."
        Copy-Item -Path "build\executables\ffmpeg" -Destination "dist\cep\exec\ffmpeg" -Force
        Write-Host "Copied macOS ffmpeg"
    }
    
    # Step 5: Create sounds directory and copy sounds
    $soundsDir = "dist\cep\exec\sounds"
    if (-not (Test-Path $soundsDir)) {
        New-Item -ItemType Directory -Force -Path $soundsDir | Out-Null
        Write-Host "Created directory: $soundsDir"
    }
    
    if (Test-Path "app\sounds") {
        Write-Host "Copying sound files..."
        Copy-Item -Path "app\sounds\*" -Destination "$soundsDir\" -Force -Recurse
    }
    
    Write-Host "Build completed successfully (skipped Python build)!" -ForegroundColor Green
    exit 0
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
Copy-Item -Path "app\ffmpeg.exe" -Destination "dist\cep\exec\ffmpeg.exe" -Force
if (-not $?) {
    Write-Host "Failed to copy ffmpeg.exe" -ForegroundColor Red
    exit 1
}

# Step 3: Copy the built executable
Write-Host "Copying YoutubetoPremiere.exe..."
if (Test-Path "build\YoutubetoPremiere\YoutubetoPremiere.exe") {
    Copy-Item -Path "build\YoutubetoPremiere\YoutubetoPremiere.exe" -Destination "dist\cep\exec\YoutubetoPremiere.exe" -Force
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
    Copy-Item -Path $_.FullName -Destination "dist\cep\exec\$($_.Name)" -Force
    if (-not $?) {
        Write-Host "Failed to copy $($_.Name)" -ForegroundColor Red
        exit 1
    }
}

# Step 5: Create sounds directory and copy sounds
$soundsDir = "dist\cep\exec\sounds"
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

    Set-Content -Path "dist\cep\exec\macOS_INFO.txt" -Value $macInfoContent
    Write-Host "Created macOS info file" -ForegroundColor Green
}

Write-Host "Build completed successfully!" -ForegroundColor Green
exit 0 