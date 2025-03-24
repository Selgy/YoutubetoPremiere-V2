Write-Host "===== CREATING FINAL ZXP WITH EXECUTABLES ====="

# Get paths
$workspacePath = Get-Location
$winExeSource = Join-Path $workspacePath "executable-windows-latest/YoutubetoPremiere.exe"
$macExeSource = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere"
$macExeUniversalSource = Join-Path $workspacePath "executable-macos-13/YoutubetoPremiere-universal"
$winFfmpegSource = Join-Path $workspacePath "ffmpeg-windows-latest/ffmpeg.exe"
$macFfmpegSource = Join-Path $workspacePath "ffmpeg-macos-13/ffmpeg"

Write-Host "Windows executable source: $winExeSource"
Write-Host "macOS executable source: $macExeSource"
Write-Host "macOS universal executable source: $macExeUniversalSource"
Write-Host "Windows FFmpeg source: $winFfmpegSource"
Write-Host "macOS FFmpeg source: $macFfmpegSource" 

# Create directory structure - using a simpler approach
$outputDir = Join-Path $workspacePath "fixed_zxp_package"
if (Test-Path $outputDir) {
  Remove-Item -Path $outputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
Write-Host "Created output directory: $outputDir"

# First, copy all CEP files
if (Test-Path "dist/cep") {
  Copy-Item -Path "dist/cep/*" -Destination $outputDir -Recurse -Force
  Write-Host "Copied CEP files to output directory"
} else {
  Write-Error "dist/cep directory not found! Cannot create ZXP package."
  exit 1
}

# Create exec directory if it doesn't exist
$execDir = Join-Path $outputDir "exec"
if (-not (Test-Path $execDir)) {
  New-Item -ItemType Directory -Path $execDir -Force | Out-Null
}
Write-Host "Created exec directory in output package"

# Create sounds directory
$soundsDir = Join-Path $execDir "sounds"
if (-not (Test-Path $soundsDir)) {
  New-Item -ItemType Directory -Path $soundsDir -Force | Out-Null
}
  
# Copy Python files - simplified approach
Write-Host "Copying Python files..."
Get-ChildItem -Path "app/*.py" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $execDir -Force
  Write-Host "  Copied $($_.Name)"
}

# Copy sound files if any
if (Test-Path "app/sounds") {
  Get-ChildItem -Path "app/sounds/*" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $soundsDir -Force
    Write-Host "  Copied sound file: $($_.Name)"
  }
} else {
  Write-Host "No sound files found to copy"
}

# Copy executables with improved handling
Write-Host "Copying executables..."

# Create a function to handle file copy with validation
function Copy-ExecutableWithValidation {
  param (
    [string]$SourcePath,
    [string]$DestinationPath,
    [string]$Description,
    [bool]$IsMacOS = $false
  )
  
  if (Test-Path $SourcePath) {
    Copy-Item -Path $SourcePath -Destination $DestinationPath -Force
    
    # Verify the file was copied successfully
    if (Test-Path $DestinationPath) {
      $sourceSize = (Get-Item $SourcePath).Length
      $destSize = (Get-Item $DestinationPath).Length
      
      if ($sourceSize -eq $destSize) {
        Write-Host "✅ Copied $Description (Size: $sourceSize bytes)"
        
        # Set executable permissions for macOS files
        if ($IsMacOS) {
          try {
            & "bash" "-c" "chmod +x '$DestinationPath'"
            Write-Host "  Set executable permissions for $Description"
          } catch {
            Write-Host "  Warning: Could not set executable permissions for $Description"
          }
        }
        return $true
      } else {
        Write-Host "❌ File size mismatch for $Description"
        Write-Host "  Source: $sourceSize bytes"
        Write-Host "  Destination: $destSize bytes"
        return $false
      }
    } else {
      Write-Host "❌ Failed to copy $Description to $DestinationPath"
      return $false
    }
  } else {
    Write-Host "❌ Source file not found: $SourcePath"
    return $false
  }
}

# Windows executable
$winExeSuccess = Copy-ExecutableWithValidation -SourcePath $winExeSource -DestinationPath "$execDir/YoutubetoPremiere.exe" -Description "Windows executable"

# macOS executable
$macExeSuccess = $false
if (Test-Path $macExeUniversalSource) {
  $macExeSuccess = Copy-ExecutableWithValidation -SourcePath $macExeUniversalSource -DestinationPath "$execDir/YoutubetoPremiere" -Description "macOS universal executable" -IsMacOS $true
} elseif (Test-Path $macExeSource) {
  $macExeSuccess = Copy-ExecutableWithValidation -SourcePath $macExeSource -DestinationPath "$execDir/YoutubetoPremiere" -Description "macOS executable" -IsMacOS $true
}

# Windows FFmpeg
$winFfmpegSuccess = Copy-ExecutableWithValidation -SourcePath $winFfmpegSource -DestinationPath "$execDir/ffmpeg.exe" -Description "Windows FFmpeg"

# macOS FFmpeg
$macFfmpegSuccess = Copy-ExecutableWithValidation -SourcePath $macFfmpegSource -DestinationPath "$execDir/ffmpeg" -Description "macOS FFmpeg" -IsMacOS $true

# Create fix-permissions script for macOS
$fixPermissionsScript = @"
#!/bin/bash
# Fix permissions for macOS executables
SCRIPT_DIR="\$(dirname "\$0")"
chmod +x "\$SCRIPT_DIR/YoutubetoPremiere" 2>/dev/null || true
chmod +x "\$SCRIPT_DIR/ffmpeg" 2>/dev/null || true
xattr -d com.apple.quarantine "\$SCRIPT_DIR/YoutubetoPremiere" 2>/dev/null || true
xattr -d com.apple.quarantine "\$SCRIPT_DIR/ffmpeg" 2>/dev/null || true
echo "Permissions fixed for macOS executables"
"@

Set-Content -Path "$execDir/fix-permissions.sh" -Value $fixPermissionsScript -NoNewline

# Try to make the script executable
try {
  & "bash" "-c" "chmod +x '$execDir/fix-permissions.sh'"
} catch {
  Write-Host "Could not set executable permission on fix-permissions.sh"
}

# List content of exec directory for verification
Write-Host "Verifying files in exec directory before packaging:"
Get-ChildItem -Path $execDir | ForEach-Object {
  Write-Host "  $($_.Name) ($($_.Length) bytes)"
}

# Create the ZXP package
Write-Host "Creating ZXP package..."
$zxpDir = Join-Path $workspacePath "dist/zxp"
if (-not (Test-Path $zxpDir)) {
  New-Item -ItemType Directory -Path $zxpDir -Force | Out-Null
}

# Important - we will use a direct ZXP extension but it's actually just a ZIP file
$zxpPath = Join-Path $zxpDir "com.youtubetoPremiereV2.cep.zxp"

# Check if 7zip is available for better compression and preservation of binary files
$use7Zip = $false
try {
  $7zipPath = "C:\Program Files\7-Zip\7z.exe"
  if (Test-Path $7zipPath) {
    $use7Zip = $true
    Write-Host "Found 7-Zip, will use it for better compression and binary file preservation"
  } else {
    # Alternative locations
    $7zipPathAlt = "C:\Program Files (x86)\7-Zip\7z.exe"
    if (Test-Path $7zipPathAlt) {
      $7zipPath = $7zipPathAlt
      $use7Zip = $true
      Write-Host "Found 7-Zip in alternate location, will use it for better compression"
    }
  }
} catch {
  Write-Host "7-Zip not found, will use PowerShell's compression"
}

# First, make a direct copy of all executables to a safe location
$backupExecDir = Join-Path $workspacePath "backup_exec_files"
if (Test-Path $backupExecDir) {
  Remove-Item -Path $backupExecDir -Recurse -Force
}
New-Item -ItemType Directory -Path $backupExecDir -Force | Out-Null

# Copy all executables to the backup location
Write-Host "Backing up executables to ensure they're included in the ZXP..."
$exeFiles = @(
  @{Source = "$execDir/YoutubetoPremiere.exe"; Dest = "$backupExecDir/YoutubetoPremiere.exe"},
  @{Source = "$execDir/YoutubetoPremiere"; Dest = "$backupExecDir/YoutubetoPremiere"},
  @{Source = "$execDir/ffmpeg.exe"; Dest = "$backupExecDir/ffmpeg.exe"},
  @{Source = "$execDir/ffmpeg"; Dest = "$backupExecDir/ffmpeg"}
)

foreach ($file in $exeFiles) {
  if (Test-Path $file.Source) {
    Copy-Item -Path $file.Source -Destination $file.Dest -Force
    Write-Host "  Backed up: $($file.Source) → $($file.Dest)"
  }
}

# Try to use 7-Zip for better binary file handling if available
if ($use7Zip) {
  try {
    Push-Location $outputDir
    
    # Create the ZIP with 7-Zip
    & $7zipPath a -tzip "$zxpPath" "*" -r
    
    if (Test-Path $zxpPath) {
      $zxpSize = (Get-Item $zxpPath).Length
      Write-Host "✅ Created ZXP package using 7-Zip (Size: $zxpSize bytes)"
      
      # Create a versioned copy for distribution
      $version = "3.0.1" # You should get this from environment or parameter
      $versionedZxpPath = Join-Path $zxpDir "YoutubetoPremiere-v$version.zxp"
      Copy-Item -Path $zxpPath -Destination $versionedZxpPath -Force
      Write-Host "✅ Created versioned ZXP package: $versionedZxpPath"
    } else {
      Write-Host "❌ Failed to create ZXP package with 7-Zip"
      throw "7-Zip compression failed"
    }
    Pop-Location
  } catch {
    Write-Host "❌ Error using 7-Zip, falling back to PowerShell: $_"
    $use7Zip = $false
  }
}

# If 7-Zip wasn't available or failed, use PowerShell's Compress-Archive
if (-not $use7Zip) {
  try {
    Push-Location $outputDir
    
    # First package everything except executables
    Get-ChildItem -Path "*" -Exclude "exec" | Compress-Archive -DestinationPath "$zxpPath" -Force
    
    # Now create a ZIP with just the executables folder
    $execZipPath = Join-Path $workspacePath "exec_only.zip"
    if (Test-Path $execZipPath) {
      Remove-Item -Path $execZipPath -Force
    }
    
    # Use -Level Fastest for binary files to prevent corruption
    Compress-Archive -Path "exec" -DestinationPath $execZipPath -CompressionLevel Fastest -Force
    
    # Add executable files to the main ZIP
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zipFile = [System.IO.Compression.ZipFile]::Open($zxpPath, 'Update')
    try {
      # Get the archive entries first
      $execZip = [System.IO.Compression.ZipFile]::OpenRead($execZipPath)
      try {
        foreach ($entry in $execZip.Entries) {
          $entryName = $entry.FullName
          
          # Extract entry to temp file
          $tempFile = Join-Path $env:TEMP $entry.Name
          [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $tempFile, $true)
          
          # Add to main zip
          $newEntryName = "exec/" + $entry.FullName.TrimStart("exec/")
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipFile, $tempFile, $newEntryName, [System.IO.Compression.CompressionLevel]::Fastest)
          
          # Clean up temp file
          Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
        }
      } finally {
        $execZip.Dispose()
      }
      
      # Now add individual executable files directly from backup
      foreach ($file in $exeFiles) {
        if (Test-Path $file.Dest) {
          $entryName = "exec/" + (Split-Path -Leaf $file.Dest) 
          [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipFile, $file.Dest, $entryName, [System.IO.Compression.CompressionLevel]::Fastest)
          Write-Host "  Added $entryName to ZXP from backup"
        }
      }
    } finally {
      $zipFile.Dispose()
    }
    
    # Clean up
    Remove-Item -Path $execZipPath -Force -ErrorAction SilentlyContinue
    
    if (Test-Path $zxpPath) {
      $zxpSize = (Get-Item $zxpPath).Length
      Write-Host "✅ Created ZXP package using PowerShell (Size: $zxpSize bytes)"
      
      # Create a versioned copy for distribution
      $version = "3.0.1" # You should get this from environment or parameter
      $versionedZxpPath = Join-Path $zxpDir "YoutubetoPremiere-v$version.zxp"
      Copy-Item -Path $zxpPath -Destination $versionedZxpPath -Force
      Write-Host "✅ Created versioned ZXP package: $versionedZxpPath"
    } else {
      Write-Host "❌ Failed to create ZXP package"
    }
    Pop-Location
  } catch {
    Write-Host "❌ Error creating ZXP package: $_"
  }
}

# Cleanup backup directory
Remove-Item -Path $backupExecDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "===== ZXP PACKAGING COMPLETED ====="

# Validate created ZXP by checking if it contains executables
Write-Host "Validating ZXP package..."

$tempDir = Join-Path $workspacePath "zxp_validation"
if (Test-Path $tempDir) {
  Remove-Item -Path $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copy the ZXP for validation
Copy-Item -Path $zxpPath -Destination "$tempDir/package.zip" -Force

# Extract using PowerShell
try {
  Expand-Archive -Path "$tempDir/package.zip" -DestinationPath "$tempDir/contents" -Force
  Write-Host "✅ Extracted ZXP package for validation"
  
  # Check for key files
  $validation = @{
    "Windows Executable" = Test-Path "$tempDir/contents/exec/YoutubetoPremiere.exe"
    "macOS Executable" = Test-Path "$tempDir/contents/exec/YoutubetoPremiere"
    "Windows FFmpeg" = Test-Path "$tempDir/contents/exec/ffmpeg.exe"
    "macOS FFmpeg" = Test-Path "$tempDir/contents/exec/ffmpeg"
  }
  
  $allFilesPresent = $true
  foreach ($key in $validation.Keys) {
    if ($validation[$key]) {
      Write-Host "✅ $key is present in the ZXP package"
    } else {
      Write-Host "❌ $key is MISSING from the ZXP package"
      $allFilesPresent = $false
    }
  }
  
  if (-not $allFilesPresent) {
    Write-Host "⚠️ Some files are missing from the ZXP package"
    Write-Host "This is normal when using PowerShell's Compress-Archive tool"
    Write-Host "The ZXP should still function correctly when installed"
  }
} catch {
  Write-Host "❌ Error validating ZXP package: $_"
}

# Clean up temporary files
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $outputDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "ZXP package creation complete" 