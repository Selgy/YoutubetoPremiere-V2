# Create a .zip file with platform-specific tools to preserve attributes
if ($IsWindows -or $env:OS -like "*Windows*") {
  Write-Host "Running on Windows - trying various ZIP methods..."
  
  # Try 7-Zip first (installed on GitHub runners)
  $sevenZipPath = "C:\Program Files\7-Zip\7z.exe"
  if (Test-Path $sevenZipPath) {
    Write-Host "Using 7-Zip to create archive..."
    
    # Change to output directory before running 7-Zip to avoid path issues
    $currentLocation = Get-Location
    Set-Location -Path $outputDir
    
    try {
      # Run 7-Zip from the directory to avoid path issues with wildcards
      & "$sevenZipPath" a -tzip -mx=9 "$zxpPath" "*" -r
      
      if (Test-Path $zxpPath) {
        Write-Host "✅ Successfully created ZXP package using 7-Zip"
      } else {
        Write-Host "❌ 7-Zip failed to create ZXP package"
      }
    }
    finally {
      # Restore original location
      Set-Location -Path $currentLocation
    }
  } else {
    Write-Host "7-Zip not found at expected location: $sevenZipPath"
  }
  
  # If 7-Zip failed or not found, try .NET methods
  if (-not (Test-Path $zxpPath)) {
    Write-Host "Trying .NET method for ZIP creation"
    Try {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.CompressionLevel]$compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
      [System.IO.Compression.ZipFile]::CreateFromDirectory($outputDir, $zxpPath, $compressionLevel, $false)
      if (Test-Path $zxpPath) {
        Write-Host "✅ Successfully created ZXP package using .NET"
      }
    } Catch {
      Write-Host "❌ .NET ZIP creation failed: $_"
    }
  }
  
  # Last resort: PowerShell's Compress-Archive
  if (-not (Test-Path $zxpPath)) {
    Write-Host "Trying PowerShell Compress-Archive as last resort"
    Try {
      Compress-Archive -Path "$outputDir\*" -DestinationPath $zxpPath -Force
      if (Test-Path $zxpPath) {
        Write-Host "✅ Successfully created ZXP package using Compress-Archive"
      } else {
        Write-Error "All ZIP methods failed!"
      }
    } Catch {
      Write-Error "PowerShell Compress-Archive failed: $_"
    }
  }
  
  # Final verification
  if (Test-Path $zxpPath) {
    $fileInfo = Get-Item $zxpPath
    Write-Host "ZXP created successfully! Size: $($fileInfo.Length) bytes"
  } else {
    Write-Error "Failed to create ZXP package with any method!"
    # List all available command line tools for diagnostics
    Write-Host "Available command line tools:"
    Get-Command 7z*, zip*, compress* | Format-Table -AutoSize
    exit 1
  }
} else {
  # On macOS runner, use ditto if available, otherwise zip
  Write-Host "Running on macOS - using ditto for ZXP creation if available"
  $tempZipPath = Join-Path $workspacePath "temp_zxp.zip"
  
  $dittoCmdExists = & "bash" "-c" "command -v ditto >/dev/null 2>&1 && echo 'true' || echo 'false'"
  if ($dittoCmdExists -eq "true") {
    & "bash" "-c" "ditto -c -k --keepParent \"$outputDir\" \"$tempZipPath\" && mv \"$tempZipPath\" \"$zxpPath\" || echo 'Ditto failed'"
    Write-Host "Created ZXP package using ditto (preserves all file attributes)"
  } else {
    & "bash" "-c" "cd \"$outputDir\" && zip -r -y -X \"$zxpPath\" * || echo 'Zip command failed'"
    Write-Host "Created ZXP package using zip with attributes preserved"
  }
}

Write-Host "Created ZXP package at: $zxpPath"

# Helper function to list archive contents using 7-Zip
function List-Archive {
  param (
    [string]$ArchivePath
  )
  
  $sevenZipPath = "C:\Program Files\7-Zip\7z.exe"
  if (Test-Path $sevenZipPath) {
    Write-Host "Listing archive contents using 7-Zip: $ArchivePath"
    & "$sevenZipPath" l "$ArchivePath"
  } else {
    Write-Host "7-Zip not available to list archive contents"
  }
}

# Verify ZXP exists before continuing
if (-not (Test-Path $zxpPath)) {
  Write-Error "ZXP file not found after creation: $zxpPath"
  # List the directory to see what's there
  $zxpDir = Split-Path -Parent $zxpPath
  Write-Host "Contents of the ZXP directory:"
  Get-ChildItem -Path $zxpDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Get ZXP file info
$zxpInfo = Get-Item $zxpPath
Write-Host "ZXP file details: $($zxpInfo.Name), Size: $($zxpInfo.Length) bytes, LastWriteTime: $($zxpInfo.LastWriteTime)"

# List archive contents with 7-Zip if available
List-Archive -ArchivePath $zxpPath

# Verify ZXP contents
$tempExtractDir = Join-Path $workspacePath "verify_zxp"
if (Test-Path $tempExtractDir) {
  Remove-Item -Path $tempExtractDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempExtractDir -Force | Out-Null

Write-Host "Verifying ZXP contents..."
try {
  # Make sure the ZXP file exists and has content
  if (-not (Test-Path $zxpPath) -or (Get-Item $zxpPath).Length -eq 0) {
    Write-Error "ZXP file is missing or empty: $zxpPath"
    exit 1
  }
  
  # Copy ZXP to a zip file for extraction
  $packageZip = Join-Path -Path $tempExtractDir -ChildPath "package.zip"
  Copy-Item -Path $zxpPath -Destination $packageZip -Force
  
  # Verify the copy succeeded
  if (-not (Test-Path $packageZip) -or (Get-Item $packageZip).Length -eq 0) {
    Write-Error "Failed to copy ZXP to temporary location for verification"
    exit 1
  }
  
  # Extract the ZIP
  $contentsDir = Join-Path -Path $tempExtractDir -ChildPath "contents"
  Write-Host "Extracting ZXP for verification..."
  Expand-Archive -Path $packageZip -DestinationPath $contentsDir -Force
  
  # Check if extraction succeeded
  if (-not (Test-Path $contentsDir)) {
    Write-Error "Failed to extract ZXP contents for verification"
    exit 1
  }
  
  # List extracted contents
  Write-Host "Extracted ZXP contents:"
  Get-ChildItem -Path $contentsDir -Recurse | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
  
  # Now verify specific files
  $macExePath = Join-Path -Path $contentsDir -ChildPath "exec/YoutubetoPremiere"
  $macFfmpegPath = Join-Path -Path $contentsDir -ChildPath "exec/ffmpeg"
  
  if (Test-Path $macExePath) {
    Write-Host "✅ macOS executable found in ZXP"
    # Show file details
    & "bash" "-c" "file ""$macExePath"" 2>/dev/null || echo 'File command not available'"
    & "bash" "-c" "ls -la ""$macExePath"" || echo 'ls command failed'"
    
    # Verify executable permission is preserved
    $isExecutable = & "bash" "-c" "test -x ""$macExePath"" && echo 'true' || echo 'false'"
    if ($isExecutable -eq "true") {
        Write-Host "✅ macOS executable permission is preserved"
    } else {
        Write-Host "❌ macOS executable permission is NOT preserved!"
    }
  } else {
    Write-Host "❌ ERROR: macOS executable not found in ZXP!"
    # List the exec directory to see what's there
    $extractedExecDir = Join-Path -Path $contentsDir -ChildPath "exec"
    Write-Host "Contents of the exec directory in ZXP:"
    Get-ChildItem -Path $extractedExecDir -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
  }
  
  if (Test-Path $macFfmpegPath) {
    Write-Host "✅ macOS FFmpeg found in ZXP"
  } else {
    Write-Host "❌ ERROR: macOS FFmpeg not found in ZXP!"
  }
}
catch {
  Write-Error "Error during ZXP verification: $_"
  exit 1
}

# Create ZXP package
Write-Host "Creating ZXP package..."
$zxpDir = Split-Path -Parent $zxpPath
if (-not (Test-Path $zxpDir)) {
  New-Item -ItemType Directory -Path $zxpDir -Force | Out-Null
  Write-Host "Created ZXP directory: $zxpDir"
}

# Verify source directory has content before proceeding
if (-not (Test-Path $outputDir)) {
  Write-Error "Output directory not found: $outputDir"
  exit 1
}

# Check that we have files to package
$fileCount = (Get-ChildItem -Path $outputDir -Recurse -File).Count
if ($fileCount -eq 0) {
  Write-Error "Output directory is empty! Nothing to package."
  exit 1
}

Write-Host "Found $fileCount files to package in $outputDir"
Write-Host "Top-level directories in output folder:"
Get-ChildItem -Path $outputDir | ForEach-Object { Write-Host "  $($_.Name)" }

# Check if exec directory contains the expected files
$execDir = Join-Path -Path $outputDir -ChildPath "exec"
$execFiles = Get-ChildItem -Path $execDir -ErrorAction SilentlyContinue
Write-Host "Files in exec directory:"
$execFiles | ForEach-Object { Write-Host "  $($_.Name) - $($_.Length) bytes" }

if (Test-Path $zxpPath) {
  Remove-Item -Path $zxpPath -Force
  Write-Host "Removed existing ZXP file"
} 