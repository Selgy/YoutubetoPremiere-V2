# Create a .zip file with platform-specific tools to preserve attributes
if ($IsWindows -or $env:OS -like "*Windows*") {
  Write-Host "Running on Windows - using .NET for ZIP creation"
  
  # Make sure destination directory exists
  $zxpDir = Split-Path -Parent $zxpPath
  if (-not (Test-Path $zxpDir)) {
    New-Item -ItemType Directory -Path $zxpDir -Force | Out-Null
    Write-Host "Created ZXP directory: $zxpDir"
  }
  
  # Verify source directory
  if (-not (Test-Path $outputDir)) {
    Write-Error "Output directory not found: $outputDir"
    exit 1
  }
  
  Write-Host "Contents of output directory before zipping:"
  Get-ChildItem -Path $outputDir -Recurse | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
  
  # Use .NET to create the ZIP file
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.CompressionLevel]$compressionLevel = [System.IO.Compression.CompressionLevel]::Optimal
  Write-Host "Creating ZIP archive using .NET: $zxpPath from $outputDir"
  [System.IO.Compression.ZipFile]::CreateFromDirectory($outputDir, $zxpPath, $compressionLevel, $false)
  
  # Verify the ZIP was created
  if (Test-Path $zxpPath) {
    Write-Host "✅ Successfully created ZXP package using .NET: $zxpPath (Size: $((Get-Item $zxpPath).Length) bytes)"
  } else {
    Write-Host "❌ Failed to create ZXP package using .NET"
    # Try fallback method using Compress-Archive
    Write-Host "Trying fallback method with Compress-Archive..."
    Compress-Archive -Path "$outputDir\*" -DestinationPath $zxpPath -Force
    if (Test-Path $zxpPath) {
      Write-Host "✅ Successfully created ZXP package using Compress-Archive"
    } else {
      Write-Error "Failed to create ZXP package using both methods"
      exit 1
    }
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

# Verify ZXP exists before continuing
if (-not (Test-Path $zxpPath)) {
  Write-Error "ZXP file not found after creation: $zxpPath"
  # List the directory to see what's there
  Write-Host "Contents of the ZXP directory:"
  Get-ChildItem -Path (Split-Path -Parent $zxpPath) -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Get ZXP file info
$zxpInfo = Get-Item $zxpPath
Write-Host "ZXP file details: $($zxpInfo.Name), Size: $($zxpInfo.Length) bytes, LastWriteTime: $($zxpInfo.LastWriteTime)"

# Verify ZXP contents
$tempExtractDir = Join-Path $workspacePath "verify_zxp"
if (Test-Path $tempExtractDir) {
  Remove-Item -Path $tempExtractDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempExtractDir -Force | Out-Null

Write-Host "Verifying ZXP contents..."
try {
  # Copy ZXP to a zip file for extraction
  Copy-Item -Path $zxpPath -Destination "$tempExtractDir/package.zip" -Force
  
  # Verify the copy succeeded
  if (-not (Test-Path "$tempExtractDir/package.zip")) {
    Write-Error "Failed to copy ZXP to temporary location for verification"
    exit 1
  }
  
  # Extract the ZIP
  Write-Host "Extracting ZXP for verification..."
  Expand-Archive -Path "$tempExtractDir/package.zip" -DestinationPath "$tempExtractDir/contents" -Force
  
  # Check if extraction succeeded
  if (-not (Test-Path "$tempExtractDir/contents")) {
    Write-Error "Failed to extract ZXP contents for verification"
    exit 1
  }
  
  # List extracted contents
  Write-Host "Extracted ZXP contents:"
  Get-ChildItem -Path "$tempExtractDir/contents" -Recurse | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
  
  # Now verify specific files
  $macExePath = "$tempExtractDir/contents/exec/YoutubetoPremiere"
  $macFfmpegPath = "$tempExtractDir/contents/exec/ffmpeg"
  
  if (Test-Path $macExePath) {
    Write-Host "✅ macOS executable found in ZXP"
    # Show file details
    & "bash" "-c" "file \"$macExePath\" 2>/dev/null || echo 'File command not available'"
    & "bash" "-c" "ls -la \"$macExePath\" || echo 'ls command failed'"
    
    # Verify executable permission is preserved
    $isExecutable = & "bash" "-c" "test -x \"$macExePath\" && echo 'true' || echo 'false'"
    if ($isExecutable -eq "true") {
        Write-Host "✅ macOS executable permission is preserved"
    } else {
        Write-Host "❌ macOS executable permission is NOT preserved!"
    }
  } else {
    Write-Host "❌ ERROR: macOS executable not found in ZXP!"
    # List the exec directory to see what's there
    Write-Host "Contents of the exec directory in ZXP:"
    Get-ChildItem -Path "$tempExtractDir/contents/exec" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
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