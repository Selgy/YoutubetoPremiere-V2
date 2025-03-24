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

# Create directory structure
$zxpOutputDir = Join-Path $workspacePath "zxp_output"
if (Test-Path $zxpOutputDir) {
  Remove-Item -Path $zxpOutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $zxpOutputDir -Force | Out-Null
Write-Host "Created output directory: $zxpOutputDir"

# First let's ensure the dist/cep directory exists and has the right structure
Write-Host "Checking dist/cep directory structure..."
$cepDir = Join-Path $workspacePath "dist/cep"
if (-not (Test-Path $cepDir)) {
  Write-Host "dist/cep directory not found, creating it"
  New-Item -ItemType Directory -Path $cepDir -Force | Out-Null
}

# Create exec directory in dist/cep if it doesn't exist
$execDir = Join-Path $cepDir "exec"
if (-not (Test-Path $execDir)) {
  Write-Host "Creating exec directory in dist/cep"
  New-Item -ItemType Directory -Path $execDir -Force | Out-Null
}

# Copy files to dist/cep/exec first
Write-Host "Copying files to dist/cep/exec"

# Create sounds directory
$soundsDir = Join-Path $execDir "sounds"
if (-not (Test-Path $soundsDir)) {
  New-Item -ItemType Directory -Path $soundsDir -Force | Out-Null
}

# Copy Python files
Write-Host "Copying Python files to exec directory..."
Get-ChildItem -Path "app/*.py" -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $execDir -Force
  Write-Host "  Copied $($_.Name)"
}

# Copy sounds if they exist
if (Test-Path "app/sounds") {
  Write-Host "Copying sound files..."
  Get-ChildItem -Path "app/sounds/*" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $soundsDir -Force
    Write-Host "  Copied sound: $($_.Name)"
  }
}

# Copy executables
Write-Host "Copying executables to exec directory..."

# Windows executable
if (Test-Path $winExeSource) {
  Copy-Item -Path $winExeSource -Destination (Join-Path $execDir "YoutubetoPremiere.exe") -Force
  Write-Host "  ✅ Copied Windows executable"
} else {
  Write-Host "  ❌ Windows executable not found at: $winExeSource"
}

# macOS executable
if (Test-Path $macExeUniversalSource) {
  Copy-Item -Path $macExeUniversalSource -Destination (Join-Path $execDir "YoutubetoPremiere") -Force
  Write-Host "  ✅ Copied macOS universal executable"
} elseif (Test-Path $macExeSource) {
  Copy-Item -Path $macExeSource -Destination (Join-Path $execDir "YoutubetoPremiere") -Force
  Write-Host "  ✅ Copied macOS standard executable"
} else {
  Write-Host "  ❌ macOS executable not found at: $macExeSource or $macExeUniversalSource"
}

# Windows FFmpeg
if (Test-Path $winFfmpegSource) {
  Copy-Item -Path $winFfmpegSource -Destination (Join-Path $execDir "ffmpeg.exe") -Force
  Write-Host "  ✅ Copied Windows FFmpeg"
} else {
  Write-Host "  ❌ Windows FFmpeg not found at: $winFfmpegSource"
}

# macOS FFmpeg
if (Test-Path $macFfmpegSource) {
  Copy-Item -Path $macFfmpegSource -Destination (Join-Path $execDir "ffmpeg") -Force
  Write-Host "  ✅ Copied macOS FFmpeg"
} else {
  Write-Host "  ❌ macOS FFmpeg not found at: $macFfmpegSource"
}

# Create permission fix script to ensure executables are runnable
$permissionScriptContent = @"
#!/bin/bash
# Fix permissions for macOS executables
chmod 755 "\$(dirname "\$0")/YoutubetoPremiere" 2>/dev/null || true
chmod 755 "\$(dirname "\$0")/ffmpeg" 2>/dev/null || true
xattr -d com.apple.quarantine "\$(dirname "\$0")/YoutubetoPremiere" 2>/dev/null || true
xattr -d com.apple.quarantine "\$(dirname "\$0")/ffmpeg" 2>/dev/null || true
echo "Permissions fixed for macOS executables"
"@
Set-Content -Path (Join-Path $execDir "fix-permissions.sh") -Value $permissionScriptContent -NoNewline

# Make sure all files are in place
Write-Host "Verifying files in dist/cep/exec..."
$execFiles = Get-ChildItem -Path $execDir
foreach ($file in $execFiles) {
  Write-Host "  $($file.Name) ($($file.Length) bytes)"
}

# Check if yarn zxp is available, and if not, create our own ZXP package
$canRunYarnZxp = $false
try {
  $yamlExists = Test-Path "package.json"
  if ($yamlExists) {
    $canRunYarnZxp = $true
    Write-Host "Found package.json, will try running yarn zxp"
  }
} catch {
  Write-Host "Error checking for package.json: $_"
}

# Try to run yarn zxp
$yarnZxpSuccess = $false
if ($canRunYarnZxp) {
  try {
    Write-Host "Running yarn zxp command..."
    yarn zxp
    $zxpPath = Join-Path $workspacePath "dist/zxp/com.youtubetoPremiereV2.cep.zxp"
    if (Test-Path $zxpPath) {
      $yarnZxpSuccess = $true
      Write-Host "  ✅ yarn zxp command successful"
    } else {
      Write-Host "  ❌ yarn zxp did not create a ZXP file"
    }
  } catch {
    Write-Host "  ❌ Error running yarn zxp: $_"
  }
}

# If yarn zxp failed or couldn't be run, create our own package
if (-not $yarnZxpSuccess) {
  Write-Host "Creating ZXP package manually..."
  
  # Ensure the directory exists
  $zxpDir = Join-Path $workspacePath "dist/zxp"
  if (-not (Test-Path $zxpDir)) {
    New-Item -ItemType Directory -Path $zxpDir -Force | Out-Null
  }
  
  $zxpPath = Join-Path $zxpDir "com.youtubetoPremiereV2.cep.zxp"
  
  # If the ZXP file exists from a previous run, we'll delete it
  if (Test-Path $zxpPath) {
    Remove-Item -Path $zxpPath -Force
  }
  
  # First, copy all content from dist/cep to zxp_output
  Write-Host "Copying dist/cep contents to temporary directory..."
  Copy-Item -Path (Join-Path $cepDir "*") -Destination $zxpOutputDir -Recurse -Force

  # For Windows, use Compress-Archive
  try {
    Write-Host "Creating ZIP archive of contents..."
    Push-Location $zxpOutputDir
    Compress-Archive -Path "*" -DestinationPath $zxpPath -Force
    if (Test-Path $zxpPath) {
      Write-Host "  ✅ Successfully created ZXP package using Compress-Archive"
    } else {
      Write-Host "  ❌ Failed to create ZXP package using Compress-Archive"
    }
    Pop-Location
  } catch {
    Write-Host "  ❌ Error creating archive: $_"
  }
}

# Verify the ZXP was created
if (Test-Path $zxpPath) {
  Write-Host "ZXP package created successfully at: $zxpPath"
  Write-Host "ZXP file size: $((Get-Item $zxpPath).Length) bytes"
  
  # Verify contents
  $tempDir = Join-Path $workspacePath "verify_zxp"
  if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  
  # Extract and verify
  $tempZipPath = Join-Path $tempDir "package.zip"
  $tempExtractPath = Join-Path $tempDir "contents"
  New-Item -ItemType Directory -Path $tempExtractPath -Force | Out-Null
  
  # Copy the ZXP (which is a ZIP) to our temporary location
  Copy-Item -Path $zxpPath -Destination $tempZipPath -Force
  
  try {
    # Extract using Expand-Archive
    Expand-Archive -Path $tempZipPath -DestinationPath $tempExtractPath -Force
    Write-Host "Extracted ZXP for verification"
    
    # Check for critical files
    $criticalFiles = @(
      @{Path = "exec/YoutubetoPremiere.exe"; Name = "Windows executable"},
      @{Path = "exec/YoutubetoPremiere"; Name = "macOS executable"},
      @{Path = "exec/ffmpeg.exe"; Name = "Windows FFmpeg"},
      @{Path = "exec/ffmpeg"; Name = "macOS FFmpeg"}
    )
    
    $missingFiles = @()
    foreach ($file in $criticalFiles) {
      $filePath = Join-Path $tempExtractPath $file.Path
      if (Test-Path $filePath) {
        Write-Host "  ✅ Found $($file.Name) in ZXP"
      } else {
        Write-Host "  ❌ $($file.Name) is MISSING from ZXP"
        $missingFiles += $file
      }
    }
    
    # If we're missing files, let's try a direct approach
    if ($missingFiles.Count -gt 0) {
      Write-Host "Some critical files are missing. Recreating ZXP with direct inclusion..."
      
      # Add the missing files directly
      foreach ($file in $missingFiles) {
        if ($file.Path -eq "exec/YoutubetoPremiere.exe" -and (Test-Path $winExeSource)) {
          $destPath = Join-Path $tempExtractPath "exec"
          if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
          }
          Copy-Item -Path $winExeSource -Destination (Join-Path $destPath "YoutubetoPremiere.exe") -Force
          Write-Host "  ✅ Added Windows executable directly"
        }
        elseif ($file.Path -eq "exec/YoutubetoPremiere") {
          if (Test-Path $macExeUniversalSource) {
            $destPath = Join-Path $tempExtractPath "exec"
            if (-not (Test-Path $destPath)) {
              New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
            Copy-Item -Path $macExeUniversalSource -Destination (Join-Path $destPath "YoutubetoPremiere") -Force
            Write-Host "  ✅ Added macOS universal executable directly"
          }
          elseif (Test-Path $macExeSource) {
            $destPath = Join-Path $tempExtractPath "exec"
            if (-not (Test-Path $destPath)) {
              New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
            Copy-Item -Path $macExeSource -Destination (Join-Path $destPath "YoutubetoPremiere") -Force
            Write-Host "  ✅ Added macOS standard executable directly"
          }
        }
        elseif ($file.Path -eq "exec/ffmpeg.exe" -and (Test-Path $winFfmpegSource)) {
          $destPath = Join-Path $tempExtractPath "exec"
          if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
          }
          Copy-Item -Path $winFfmpegSource -Destination (Join-Path $destPath "ffmpeg.exe") -Force
          Write-Host "  ✅ Added Windows FFmpeg directly"
        }
        elseif ($file.Path -eq "exec/ffmpeg" -and (Test-Path $macFfmpegSource)) {
          $destPath = Join-Path $tempExtractPath "exec"
          if (-not (Test-Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
          }
          Copy-Item -Path $macFfmpegSource -Destination (Join-Path $destPath "ffmpeg") -Force
          Write-Host "  ✅ Added macOS FFmpeg directly"
        }
      }
      
      # Re-create the ZXP package
      Remove-Item -Path $zxpPath -Force -ErrorAction SilentlyContinue
      
      try {
        Write-Host "Re-creating ZXP package with all files..."
        Push-Location $tempExtractPath
        Compress-Archive -Path "*" -DestinationPath $zxpPath -Force
        Pop-Location
        
        if (Test-Path $zxpPath) {
          Write-Host "  ✅ Successfully recreated ZXP package with all files"
          Write-Host "  New ZXP file size: $((Get-Item $zxpPath).Length) bytes"
        } else {
          Write-Host "  ❌ Failed to recreate ZXP package"
        }
      } catch {
        Write-Host "  ❌ Error recreating ZXP package: $_"
      }
    }
  } catch {
    Write-Host "  ❌ Error extracting or verifying ZXP: $_"
  }
  
  # Final check to ensure ZXP exists
  if (Test-Path $zxpPath) {
    Write-Host "✅ Final ZXP package is available at: $zxpPath"
  } else {
    Write-Host "❌ Final ZXP package was not created successfully"
  }
} else {
  Write-Host "❌ Failed to create ZXP package"
}

# Clean up
Write-Host "Cleaning up temporary files..."
if (Test-Path $zxpOutputDir) {
  Remove-Item -Path $zxpOutputDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $tempDir) {
  Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "===== FINAL ZXP PACKAGING COMPLETED =====" 