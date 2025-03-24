#!/usr/bin/env pwsh
Write-Host "===== CREATING FINAL ZXP WITH EXECUTABLES ====="

# Get paths
$workspacePath = Get-Location
$winExeSource = Join-Path $workspacePath "executable-windows-latest/YoutubetoPremiere.exe"
$macExeSource = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere"
$winFfmpegSource = Join-Path $workspacePath "ffmpeg-windows-latest/ffmpeg.exe"
$macFfmpegSource = Join-Path $workspacePath "ffmpeg-macos-13/ffmpeg"
$tempNotarizedDir = Join-Path $workspacePath "temp_notarized"

Write-Host "Windows FFmpeg source: $winFfmpegSource"
Write-Host "macOS FFmpeg source: $macFfmpegSource"

# Prepare directory for executables
$execDir = "dist/cep/exec"
if (-not (Test-Path $execDir)) {
    New-Item -ItemType Directory -Path $execDir -Force | Out-Null
    Write-Host "Created exec directory: $execDir"
}

# Ensure dist/cep exists - copy from dist/cep if needed
if (Test-Path "dist/cep") {
    Write-Host "dist/cep directory exists"
} else {
    Write-Host "Creating dist/cep directory structure"
    New-Item -ItemType Directory -Path "dist/cep" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/js" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/jsx" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/assets" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/CSXS" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/exec" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/main" -Force | Out-Null
    New-Item -ItemType Directory -Path "dist/cep/settings" -Force | Out-Null
}

# Copy Python files for both platforms
if (Test-Path "app/*.py") {
    Get-ChildItem -Path "app/*.py" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination "$execDir/" -Force
        Write-Host "Copied Python file: $($_.Name)"
    }
}

# Create sounds directory and copy sounds
$soundsDir = "$execDir/sounds"
if (-not (Test-Path $soundsDir)) {
    New-Item -ItemType Directory -Path $soundsDir -Force | Out-Null
    Write-Host "Created sounds directory: $soundsDir"
}

if (Test-Path "app/sounds") {
    Get-ChildItem -Path "app/sounds/*" | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination "$soundsDir/" -Force
        Write-Host "Copied sound file: $($_.Name)"
    }
}

# Copy Windows executable
if (Test-Path $winExeSource) {
    Copy-Item -Path $winExeSource -Destination "$execDir/YoutubetoPremiere.exe" -Force
    Write-Host "Copied Windows executable"
} else {
    Write-Host "WARNING: Windows executable not found at $winExeSource"
}

# Check for notarized macOS executable ZIP
$notarizedZipPath = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere-notarized.zip"
if (Test-Path $notarizedZipPath) {
    Write-Host "Found notarized macOS executable ZIP"
    
    # Create temp directory for extraction
    if (-not (Test-Path $tempNotarizedDir)) {
        New-Item -ItemType Directory -Path $tempNotarizedDir -Force | Out-Null
    }
    
    # Extract using Expand-Archive
    Expand-Archive -Path $notarizedZipPath -DestinationPath $tempNotarizedDir -Force
    
    # Copy notarized executable if found
    if (Test-Path "$tempNotarizedDir/YoutubetoPremiere") {
        Copy-Item -Path "$tempNotarizedDir/YoutubetoPremiere" -Destination "$execDir/YoutubetoPremiere" -Force
        Write-Host "Copied notarized macOS executable"
    } else {
        Write-Host "WARNING: Notarized macOS executable not found in ZIP"
    }
}

# Fallback to regular macOS executable if not already copied
if (-not (Test-Path "$execDir/YoutubetoPremiere") -and (Test-Path $macExeSource)) {
    Copy-Item -Path $macExeSource -Destination "$execDir/YoutubetoPremiere" -Force
    Write-Host "Copied macOS executable (fallback)"
}

# Copy FFmpeg executables
if (Test-Path $winFfmpegSource) {
    Copy-Item -Path $winFfmpegSource -Destination "$execDir/ffmpeg.exe" -Force
    Write-Host "Copied Windows FFmpeg"
} else {
    Write-Host "WARNING: Windows FFmpeg not found at $winFfmpegSource"
}

if (Test-Path $macFfmpegSource) {
    Copy-Item -Path $macFfmpegSource -Destination "$execDir/ffmpeg" -Force
    Write-Host "Copied macOS FFmpeg"
} else {
    Write-Host "WARNING: macOS FFmpeg not found at $macFfmpegSource"
}

# Set permissions for macOS executables
Write-Host "Setting executable permissions for macOS files..."
try {
    & "bash" "-c" "chmod +x \"$execDir/YoutubetoPremiere\" 2>/dev/null || true"
    & "bash" "-c" "chmod +x \"$execDir/ffmpeg\" 2>/dev/null || true"
    
    # Verify permissions
    & "bash" "-c" "ls -la \"$execDir\" | grep -E 'YoutubetoPremiere|ffmpeg'" 2>$null
} catch {
    Write-Host "WARNING: Error setting permissions: $_"
}

# Run yarn zxp command to create the ZXP package
Write-Host "Creating ZXP package using yarn zxp..."

# Check if package.json exists and has zxp script
if (Test-Path "package.json") {
    try {
        # Run yarn zxp
        yarn zxp
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ yarn zxp completed successfully!"
        } else {
            Write-Error "yarn zxp failed with exit code $LASTEXITCODE"
            exit 1
        }
    } catch {
        Write-Error "Error running yarn zxp: $_"
        exit 1
    }
} else {
    Write-Error "package.json not found. Cannot run yarn zxp."
    exit 1
}

# Verify ZXP exists
$zxpPath = "dist/zxp/com.youtubetoPremiereV2.cep.zxp"
if (Test-Path $zxpPath) {
    $fileInfo = Get-Item $zxpPath
    Write-Host "✅ ZXP package created: $zxpPath (Size: $($fileInfo.Length) bytes)"
} else {
    Write-Error "ZXP package not found at expected location: $zxpPath"
    
    # Check for ZXP in other locations
    $foundZxps = Get-ChildItem -Path "dist" -Recurse -Filter "*.zxp" -ErrorAction SilentlyContinue
    if ($foundZxps.Count -gt 0) {
        Write-Host "Found ZXP files in other locations:"
        $foundZxps | ForEach-Object { Write-Host "  $($_.FullName)" }
    } else {
        Write-Host "No ZXP files found in dist directory"
    }
    
    exit 1
}

# Clean up
if (Test-Path $tempNotarizedDir) {
    Remove-Item -Path $tempNotarizedDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "===== FINAL ZXP PACKAGING COMPLETED =====" 