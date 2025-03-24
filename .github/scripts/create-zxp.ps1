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

# First, ensure the ZXP directory exists
$zxpDir = Join-Path $workspacePath "dist/zxp"
if (-not (Test-Path $zxpDir)) {
  New-Item -ItemType Directory -Path $zxpDir -Force | Out-Null
  Write-Host "Created ZXP directory: $zxpDir"
}

# Define the final ZXP path
$zxpPath = Join-Path $zxpDir "com.youtubetoPremiereV2.cep.zxp"

# Create temporary directory to build our package
$tempPackageDir = Join-Path $workspacePath "temp_package"
if (Test-Path $tempPackageDir) {
  Remove-Item -Path $tempPackageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempPackageDir -Force | Out-Null
Write-Host "Created temporary package directory: $tempPackageDir"

# Check if we have a built CEP package already
$cepDir = Join-Path $workspacePath "dist/cep"
if (Test-Path $cepDir) {
  Write-Host "Found existing CEP package, copying to temporary directory..."
  Copy-Item -Path "$cepDir/*" -Destination $tempPackageDir -Recurse -Force
} else {
  Write-Host "⚠️ No existing CEP package found at $cepDir"
  # Create basic structure
  New-Item -ItemType Directory -Path (Join-Path $tempPackageDir "CSXS") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tempPackageDir "js") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $tempPackageDir "jsx") -Force | Out-Null
}

# Ensure the exec directory exists in our temporary package
$execDir = Join-Path $tempPackageDir "exec"
if (-not (Test-Path $execDir)) {
  New-Item -ItemType Directory -Path $execDir -Force | Out-Null
  Write-Host "Created exec directory: $execDir"
}

# Create sounds directory
$soundsDir = Join-Path $execDir "sounds"
if (-not (Test-Path $soundsDir)) {
  New-Item -ItemType Directory -Path $soundsDir -Force | Out-Null
  Write-Host "Created sounds directory: $soundsDir"
}

# Copy Python files if they exist
Write-Host "Copying Python files..."
if (Test-Path "app/*.py") {
  Get-ChildItem -Path "app/*.py" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $execDir -Force
    Write-Host "  Copied $($_.Name)"
  }
} else {
  Write-Host "  No Python files found in app directory"
}

# Copy sounds if they exist
if (Test-Path "app/sounds") {
  Write-Host "Copying sound files..."
  Get-ChildItem -Path "app/sounds/*" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $soundsDir -Force
    Write-Host "  Copied sound: $($_.Name)"
  }
} else {
  Write-Host "  No sound files found in app directory"
}

# Copy executables
Write-Host "Copying executables..."

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

# List content of exec directory
Write-Host "Content of exec directory before packaging:"
Get-ChildItem -Path $execDir -Recurse -Force | ForEach-Object {
  Write-Host "  $($_.Name) ($($_.Length) bytes)"
}

# Check if the manifest.xml exists, if not create a minimal one
$manifestDir = Join-Path $tempPackageDir "CSXS"
$manifestPath = Join-Path $manifestDir "manifest.xml"
if (-not (Test-Path $manifestPath)) {
  Write-Host "Creating minimal manifest.xml file..."
  
  $manifestContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="6.0" ExtensionBundleId="com.youtubetoPremiereV2.cep" ExtensionBundleVersion="1.0.0">
  <ExtensionList>
    <Extension Id="com.youtubetoPremiereV2.cep.main" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[15.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="9.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.youtubetoPremiereV2.cep.main">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/index.js</ScriptPath>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>YouTube to Premiere V2</Menu>
          <Geometry>
            <Size>
              <Height>600</Height>
              <Width>400</Width>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
"@
  
  if (-not (Test-Path $manifestDir)) {
    New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null
  }
  
  Set-Content -Path $manifestPath -Value $manifestContent
  Write-Host "  ✅ Created minimal manifest.xml"
}

# Check if we have a simple HTML file, if not create it
$indexPath = Join-Path $tempPackageDir "index.html"
if (-not (Test-Path $indexPath)) {
  Write-Host "Creating minimal index.html file..."
  
  $indexContent = @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube to Premiere V2</title>
</head>
<body>
  <h1>YouTube to Premiere V2</h1>
  <p>Extension is loading...</p>
</body>
</html>
"@
  
  Set-Content -Path $indexPath -Value $indexContent
  Write-Host "  ✅ Created minimal index.html"
}

# Create the ZXP package
Write-Host "Creating ZXP package..."

# Delete old ZXP if it exists
if (Test-Path $zxpPath) {
  Remove-Item -Path $zxpPath -Force
  Write-Host "  Removed existing ZXP file"
}

# Create the ZXP package using PowerShell's Compress-Archive
try {
  # PowerShell's Compress-Archive
  Push-Location $tempPackageDir
  # Get all items to include in the archive
  $allFiles = Get-ChildItem -Path "." -Recurse -Force

  if ($allFiles.Count -gt 0) {
    Compress-Archive -Path "*" -DestinationPath $zxpPath -Force
    if (Test-Path $zxpPath) {
      Write-Host "  ✅ Created ZXP package using PowerShell Compress-Archive"
      Write-Host "  ✅ ZXP package created: $zxpPath"
      Write-Host "  ZXP file size: $((Get-Item $zxpPath).Length) bytes"
    } else {
      Write-Host "  ❌ Failed to create ZXP package using PowerShell Compress-Archive"
    }
  } else {
    Write-Host "  ❌ No files found in the package directory to compress"
  }
  Pop-Location
} catch {
  Write-Host "  ❌ Error creating ZXP package: $_"
}

# Verify the ZXP package
if (Test-Path $zxpPath) {
  Write-Host "Verifying ZXP package..."
  
  # Create temp extraction directory
  $extractDir = Join-Path $workspacePath "temp_extract"
  if (Test-Path $extractDir) {
    Remove-Item -Path $extractDir -Recurse -Force
  }
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  
  # Copy the ZXP to a zip file
  $zipPath = Join-Path $extractDir "package.zip"
  Copy-Item -Path $zxpPath -Destination $zipPath -Force
  
  # Extract the ZIP
  try {
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
    Write-Host "  ✅ Extracted ZXP package for verification"
    
    # Check for critical files
    $criticalFiles = @(
      @{Path = "exec/YoutubetoPremiere.exe"; Name = "Windows executable"},
      @{Path = "exec/YoutubetoPremiere"; Name = "macOS executable"},
      @{Path = "exec/ffmpeg.exe"; Name = "Windows FFmpeg"},
      @{Path = "exec/ffmpeg"; Name = "macOS FFmpeg"}
    )
    
    $missingFiles = @()
    foreach ($file in $criticalFiles) {
      $filePath = Join-Path $extractDir $file.Path
      if (Test-Path $filePath) {
        $fileSize = (Get-Item $filePath).Length
        Write-Host "  ✅ Found $($file.Name) in ZXP (size: $fileSize bytes)"
      } else {
        Write-Host "  ❌ $($file.Name) is MISSING from ZXP"
        $missingFiles += $file
      }
    }
    
    # If files are missing, create a fixed ZXP
    if ($missingFiles.Count -gt 0) {
      Write-Host "Found $($missingFiles.Count) missing files in ZXP package, creating a fixed version..."
      
      # Create a fixed directory
      $fixedDir = Join-Path $workspacePath "fixed_package"
      if (Test-Path $fixedDir) {
        Remove-Item -Path $fixedDir -Recurse -Force
      }
      
      # Copy extracted content to fixed directory
      Copy-Item -Path "$extractDir/*" -Destination $fixedDir -Recurse -Force
      
      # Ensure exec directory exists
      $fixedExecDir = Join-Path $fixedDir "exec"
      if (-not (Test-Path $fixedExecDir)) {
        New-Item -ItemType Directory -Path $fixedExecDir -Force | Out-Null
      }
      
      # Copy missing files
      foreach ($file in $missingFiles) {
        if ($file.Path -eq "exec/YoutubetoPremiere.exe" -and (Test-Path $winExeSource)) {
          Copy-Item -Path $winExeSource -Destination (Join-Path $fixedDir "exec/YoutubetoPremiere.exe") -Force
          Write-Host "  ✅ Added Windows executable to fixed package"
        }
        elseif ($file.Path -eq "exec/YoutubetoPremiere") {
          if (Test-Path $macExeUniversalSource) {
            Copy-Item -Path $macExeUniversalSource -Destination (Join-Path $fixedDir "exec/YoutubetoPremiere") -Force
            Write-Host "  ✅ Added macOS universal executable to fixed package"
          }
          elseif (Test-Path $macExeSource) {
            Copy-Item -Path $macExeSource -Destination (Join-Path $fixedDir "exec/YoutubetoPremiere") -Force
            Write-Host "  ✅ Added macOS standard executable to fixed package"
          }
        }
        elseif ($file.Path -eq "exec/ffmpeg.exe" -and (Test-Path $winFfmpegSource)) {
          Copy-Item -Path $winFfmpegSource -Destination (Join-Path $fixedDir "exec/ffmpeg.exe") -Force
          Write-Host "  ✅ Added Windows FFmpeg to fixed package"
        }
        elseif ($file.Path -eq "exec/ffmpeg" -and (Test-Path $macFfmpegSource)) {
          Copy-Item -Path $macFfmpegSource -Destination (Join-Path $fixedDir "exec/ffmpeg") -Force
          Write-Host "  ✅ Added macOS FFmpeg to fixed package"
        }
      }
      
      # Copy Python files if they were missing
      if (-not (Test-Path (Join-Path $fixedDir "exec/*.py"))) {
        Write-Host "Copying Python files to fixed package..."
        if (Test-Path "app/*.py") {
          Get-ChildItem -Path "app/*.py" -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $fixedExecDir -Force
            Write-Host "  Copied $($_.Name) to fixed package"
          }
        }
      }
      
      # Create permission fix script if it's missing
      if (-not (Test-Path (Join-Path $fixedDir "exec/fix-permissions.sh"))) {
        Set-Content -Path (Join-Path $fixedDir "exec/fix-permissions.sh") -Value $permissionScriptContent -NoNewline
        Write-Host "  ✅ Added permission fix script to fixed package"
      }
      
      # Create the fixed ZXP
      try {
        Push-Location $fixedDir
        Compress-Archive -Path "*" -DestinationPath $zxpPath -Force
        Pop-Location
        
        if (Test-Path $zxpPath) {
          Write-Host "  ✅ Created fixed ZXP package"
          Write-Host "  Fixed ZXP file size: $((Get-Item $zxpPath).Length) bytes"
        } else {
          Write-Host "  ❌ Failed to create fixed ZXP package"
        }
      } catch {
        Write-Host "  ❌ Error creating fixed ZXP package: $_"
      }
      
      # Verify the fixed ZXP
      if (Test-Path $zxpPath) {
        $fixedZipPath = Join-Path $extractDir "fixed.zip"
        Copy-Item -Path $zxpPath -Destination $fixedZipPath -Force
        
        $fixedExtractDir = Join-Path $extractDir "fixed"
        if (-not (Test-Path $fixedExtractDir)) {
          New-Item -ItemType Directory -Path $fixedExtractDir -Force | Out-Null
        }
        
        try {
          Expand-Archive -Path $fixedZipPath -DestinationPath $fixedExtractDir -Force
          Write-Host "  ✅ Extracted fixed ZXP package for verification"
          
          $allFixed = $true
          foreach ($file in $criticalFiles) {
            $filePath = Join-Path $fixedExtractDir $file.Path
            if (Test-Path $filePath) {
              $fileSize = (Get-Item $filePath).Length
              Write-Host "  ✅ Fixed ZXP contains $($file.Name) (size: $fileSize bytes)"
            } else {
              Write-Host "  ❌ Fixed ZXP is still missing $($file.Name)!"
              $allFixed = $false
            }
          }
          
          if ($allFixed) {
            Write-Host "  ✅ All critical files verified in fixed ZXP package"
          } else {
            Write-Host "  ❌ Some critical files are still missing from fixed ZXP package"
          }
        } catch {
          Write-Host "  ❌ Error verifying fixed ZXP package: $_"
        }
      }
    } else {
      Write-Host "  ✅ All critical files are present in the ZXP package"
    }
  } catch {
    Write-Host "  ❌ Error extracting or verifying ZXP package: $_"
  }
  
  # Final message
  if (Test-Path $zxpPath) {
    $finalSize = (Get-Item $zxpPath).Length
    Write-Host "✅ FINAL ZXP PACKAGE CREATED: $zxpPath (size: $finalSize bytes)"
    
    # Copy to distribution location
    Copy-Item -Path $zxpPath -Destination (Join-Path $zxpDir "YoutubetoPremiere.zxp") -Force
    Write-Host "✅ Also saved as: $(Join-Path $zxpDir "YoutubetoPremiere.zxp")"
  } else {
    Write-Host "❌ Failed to create final ZXP package"
  }
} else {
  Write-Host "❌ Failed to create ZXP package"
}

# Clean up
Write-Host "Cleaning up temporary files..."
if (Test-Path $tempPackageDir) {
  Remove-Item -Path $tempPackageDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $extractDir) {
  Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path $fixedDir) {
  Remove-Item -Path $fixedDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "===== FINAL ZXP PACKAGING COMPLETED =====" 