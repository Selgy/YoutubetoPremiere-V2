# Cross-platform PyInstaller build script
# Works on both Windows and macOS

# Create necessary directories for CEP
if (!(Test-Path "dist\cep\exec")) {
    Write-Host "Creating directory: dist\cep\exec"
    New-Item -Path "dist\cep\exec" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\js")) {
    New-Item -Path "dist\cep\js" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\jsx")) {
    New-Item -Path "dist\cep\jsx" -ItemType Directory -Force
}
if (!(Test-Path "dist\cep\sounds")) {
    New-Item -Path "dist\cep\sounds" -ItemType Directory -Force
}

# Create src/exec/sounds directory if it doesn't exist
if (!(Test-Path "src\exec\sounds")) {
    Write-Host "Creating src\exec\sounds directory"
    New-Item -Path "src\exec\sounds" -ItemType Directory -Force
}

# Ensure app/sounds directory exists to prevent PyInstaller errors
if (!(Test-Path "app\sounds")) {
    Write-Host "Creating app\sounds directory with placeholder..."
    New-Item -Path "app\sounds" -ItemType Directory -Force
    New-Item -Path "app\sounds\.gitkeep" -ItemType File -Force
}

# Copy static assets that should be part of the CEP extension
Write-Host "Copying static assets to CEP extension directory..."

# Copy src/js if it exists
if (Test-Path "src\js") {
    Write-Host "Copying src\js to dist\cep\js..."
    Copy-Item -Path "src\js\*" -Destination "dist\cep\js\" -Recurse -Force -ErrorAction SilentlyContinue
}

# Copy src/jsx if it exists
if (Test-Path "src\jsx") {
    Write-Host "Copying src\jsx to dist\cep\jsx..."
    Copy-Item -Path "src\jsx\*" -Destination "dist\cep\jsx\" -Recurse -Force -ErrorAction SilentlyContinue
}

# Copy src/exec files if they exist (except sounds which we handle separately)
if (Test-Path "src\exec") {
    Write-Host "Copying src\exec files to dist\cep\exec..."
    Get-ChildItem -Path "src\exec" -File | Copy-Item -Destination "dist\cep\exec\" -Force -ErrorAction SilentlyContinue
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

# Handle sound files from all potential sources
Write-Host "Handling sound files from all sources..."

# Create sounds directory in all required locations
New-Item -Path "dist\cep\sounds" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
New-Item -Path "dist\cep\exec\sounds" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null

# First check app/sounds
if (Test-Path "app\sounds") {
    $soundFiles = Get-ChildItem -Path "app\sounds" -Exclude ".gitkeep" -File
    if ($soundFiles.Count -gt 0) {
        Write-Host "Copying sound files from app\sounds..."
        Copy-Item -Path "app\sounds\*" -Destination "dist\cep\sounds\" -Exclude ".gitkeep" -Force -ErrorAction SilentlyContinue
        Copy-Item -Path "app\sounds\*" -Destination "dist\cep\exec\sounds\" -Exclude ".gitkeep" -Force -ErrorAction SilentlyContinue
    }
}

# Then check src/exec/sounds
if (Test-Path "src\exec\sounds") {
    $soundFiles = Get-ChildItem -Path "src\exec\sounds" -File
    if ($soundFiles.Count -gt 0) {
        Write-Host "Copying sound files from src\exec\sounds..."
        Copy-Item -Path "src\exec\sounds\*" -Destination "dist\cep\sounds\" -Force -ErrorAction SilentlyContinue
        Copy-Item -Path "src\exec\sounds\*" -Destination "dist\cep\exec\sounds\" -Force -ErrorAction SilentlyContinue
    }
}

# If no sound files were found, create a placeholder
if (!(Get-ChildItem -Path "dist\cep\sounds" -File -ErrorAction SilentlyContinue)) {
    Write-Host "No sound files found in any source directory, creating placeholder"
    New-Item -Path "dist\cep\sounds\.gitkeep" -ItemType File -Force | Out-Null
}

# Create manifest.xml file if it doesn't exist
if (!(Test-Path "dist\cep\CSXS\manifest.xml")) {
    Write-Host "Creating CEP extension manifest directory..."
    New-Item -Path "dist\cep\CSXS" -ItemType Directory -Force | Out-Null
    
    # Create a basic manifest.xml file
    Write-Host "Creating basic manifest.xml file..."
    @"
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="6.0" ExtensionBundleId="com.youtubetopremiere" ExtensionBundleVersion="1.0.0"
  ExtensionBundleName="YoutubetoPremiere" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="com.youtubetopremiere.panel" Version="1.0.0" />
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
    <Extension Id="com.youtubetopremiere.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/index.js</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>YouTube to Premiere Pro</Menu>
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
"@ | Out-File -FilePath "dist\cep\CSXS\manifest.xml" -Encoding UTF8
}

# Create a basic index.html if it doesn't exist
if (!(Test-Path "dist\cep\index.html")) {
    Write-Host "Creating basic index.html file..."
    @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>YouTube to Premiere Pro</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>YouTube to Premiere Pro</h1>
  <p>This is the YouTube to Premiere Pro extension.</p>
  <p>If you're seeing this placeholder, the full extension UI wasn't built properly.</p>
  <script src="./js/index.js"></script>
</body>
</html>
"@ | Out-File -FilePath "dist\cep\index.html" -Encoding UTF8
}

# Create a basic JavaScript file if it doesn't exist
if (!(Test-Path "dist\cep\js\index.js")) {
    Write-Host "Creating basic JavaScript file..."
    New-Item -Path "dist\cep\js" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
    @"
// Basic JavaScript for the extension
console.log('YouTube to Premiere Pro extension loaded');
"@ | Out-File -FilePath "dist\cep\js\index.js" -Encoding UTF8
}

Write-Host "CEP extension files status:"
Get-ChildItem -Path "dist\cep" -Recurse -File | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") }

Write-Host "PyInstaller build completed" 