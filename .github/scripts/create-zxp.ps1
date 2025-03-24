#!/usr/bin/env pwsh
Write-Host "===== CREATING FINAL ZXP WITH EXECUTABLES ====="

# Fonction pour vérifier et gérer les erreurs de copie d'artefacts
function Copy-ArtifactWithFallback {
    param (
        [string]$SourcePath,
        [string]$DestinationPath,
        [string]$Description,
        [string]$FallbackPath = "",
        [bool]$IsRequired = $false
    )

    Write-Host "Copying $Description from $SourcePath to $DestinationPath"
    
    # Vérifier si le fichier source existe
    if (Test-Path $SourcePath) {
        # Créer le répertoire de destination s'il n'existe pas
        $DestDir = Split-Path -Path $DestinationPath -Parent
        if (-not (Test-Path $DestDir)) {
            New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
        }

        # Copier le fichier
        try {
            Copy-Item -Path $SourcePath -Destination $DestinationPath -Force
            Write-Host "✅ Successfully copied $Description"
            return $true
        }
        catch {
            Write-Host "⚠️ Error copying $Description: $_"
        }
    }
    else {
        Write-Host "⚠️ $Description not found at: $SourcePath"
    }

    # Essayer le chemin de secours si fourni
    if ($FallbackPath -ne "" -and (Test-Path $FallbackPath)) {
        try {
            Copy-Item -Path $FallbackPath -Destination $DestinationPath -Force
            Write-Host "✅ Successfully copied $Description using fallback: $FallbackPath"
            return $true
        }
        catch {
            Write-Host "⚠️ Error copying $Description from fallback: $_"
        }
    }

    # Vérifier si le fichier existe déjà à la destination
    if (Test-Path $DestinationPath) {
        Write-Host "✅ $Description already exists at destination"
        return $true
    }

    # Échouer si requis
    if ($IsRequired) {
        Write-Host "❌ ERROR: Required $Description not found!"
        if (-not $env:CI) {
            # En développement local, interrompre le script
            Write-Error "Required file not found"
            exit 1
        }
        else {
            # Dans CI, continuer avec un avertissement
            Write-Host "⚠️ CI environment detected, continuing despite missing required file..."
            return $false
        }
    }
    else {
        Write-Host "⚠️ Optional $Description not found, continuing..."
        return $false
    }
}

# Get paths
$workspacePath = Get-Location
$winExeSource = Join-Path $workspacePath "executable-windows-latest/YoutubetoPremiere.exe"
$macExeSource = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere"
$winFfmpegSource = Join-Path $workspacePath "ffmpeg-windows-latest/ffmpeg.exe"
$macFfmpegSource = Join-Path $workspacePath "ffmpeg-macos-13/ffmpeg"
$tempNotarizedDir = Join-Path $workspacePath "temp_notarized"

# Sources alternatives pour les artefacts (chemins typiques)
$altWinExeSource = Join-Path $workspacePath "artifacts/executable-windows-latest/YoutubetoPremiere.exe"
$altMacExeSource = Join-Path $workspacePath "artifacts/executable-macos-13/YoutubetoPremiere"
$altWinFfmpegSource = Join-Path $workspacePath "artifacts/ffmpeg-windows-latest/ffmpeg.exe"
$altMacFfmpegSource = Join-Path $workspacePath "artifacts/ffmpeg-macos-13/ffmpeg"

Write-Host "Windows executable source: $winExeSource"
Write-Host "macOS executable source: $macExeSource"
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
Copy-ArtifactWithFallback -SourcePath $winExeSource -DestinationPath "$execDir/YoutubetoPremiere.exe" `
                          -Description "Windows executable" -FallbackPath $altWinExeSource -IsRequired $true

# Check for notarized macOS executable ZIP
$notarizedZipPath = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere-notarized.zip"
$altNotarizedZipPath = Join-Path $workspacePath "artifacts/executable-macos-13/YoutubetoPremiere-notarized.zip"
$notarizedZipExists = $false

# Check primary location
if (Test-Path $notarizedZipPath) {
    Write-Host "Found notarized macOS executable ZIP at primary location"
    $notarizedZipExists = $true
    $zipToUse = $notarizedZipPath
}
# Check fallback location
elseif (Test-Path $altNotarizedZipPath) {
    Write-Host "Found notarized macOS executable ZIP at fallback location"
    $notarizedZipExists = $true
    $zipToUse = $altNotarizedZipPath
}

# Extract ZIP if found
if ($notarizedZipExists) {
    # Create temp directory for extraction
    if (-not (Test-Path $tempNotarizedDir)) {
        New-Item -ItemType Directory -Path $tempNotarizedDir -Force | Out-Null
    }
    
    try {
        # Extract using Expand-Archive
        Expand-Archive -Path $zipToUse -DestinationPath $tempNotarizedDir -Force
        
        # Copy notarized executable if found
        if (Test-Path "$tempNotarizedDir/YoutubetoPremiere") {
            Copy-Item -Path "$tempNotarizedDir/YoutubetoPremiere" -Destination "$execDir/YoutubetoPremiere" -Force
            Write-Host "✅ Copied notarized macOS executable"
        } else {
            Write-Host "⚠️ Notarized macOS executable not found in ZIP"
        }
    } catch {
        Write-Host "⚠️ Error extracting notarized ZIP: $_"
    }
}
else {
    Write-Host "⚠️ Notarized macOS executable ZIP not found, will try regular executable"
}

# Fallback to regular macOS executable if not already copied
if (-not (Test-Path "$execDir/YoutubetoPremiere")) {
    Copy-ArtifactWithFallback -SourcePath $macExeSource -DestinationPath "$execDir/YoutubetoPremiere" `
                              -Description "macOS executable" -FallbackPath $altMacExeSource -IsRequired $true
}

# Copy FFmpeg executables
Copy-ArtifactWithFallback -SourcePath $winFfmpegSource -DestinationPath "$execDir/ffmpeg.exe" `
                          -Description "Windows FFmpeg" -FallbackPath $altWinFfmpegSource -IsRequired $true

Copy-ArtifactWithFallback -SourcePath $macFfmpegSource -DestinationPath "$execDir/ffmpeg" `
                          -Description "macOS FFmpeg" -FallbackPath $altMacFfmpegSource -IsRequired $true

# Set permissions for macOS executables
Write-Host "Setting executable permissions for macOS files..."
try {
    & "bash" "-c" "chmod +x \"$execDir/YoutubetoPremiere\" 2>/dev/null || true"
    & "bash" "-c" "chmod +x \"$execDir/ffmpeg\" 2>/dev/null || true"
    
    # Verify permissions
    & "bash" "-c" "ls -la \"$execDir\" | grep -E 'YoutubetoPremiere|ffmpeg'" 2>$null
} catch {
    Write-Host "⚠️ Error setting permissions: $_"
}

# Check for essential files before proceeding
$essentialFiles = @(
    "$execDir/YoutubetoPremiere.exe",
    "$execDir/YoutubetoPremiere",
    "$execDir/ffmpeg.exe",
    "$execDir/ffmpeg"
)

$missingFiles = $essentialFiles | Where-Object { -not (Test-Path $_) }
if ($missingFiles.Count -gt 0) {
    Write-Host "⚠️ WARNING: The following essential files are missing:"
    $missingFiles | ForEach-Object { Write-Host "  - $_" }
    Write-Host "This may result in a non-functional package for some platforms!"
    
    if (-not $env:CI) {
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne "y") {
            Write-Host "Aborting ZXP creation."
            exit 1
        }
    }
    else {
        Write-Host "CI environment detected, continuing despite missing files..."
    }
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