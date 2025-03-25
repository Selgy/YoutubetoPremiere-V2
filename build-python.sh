#!/bin/bash
set -e

# Script for building Python app on macOS

echo "Building Python app for macOS..."

# Create necessary directories
mkdir -p dist/cep/exec
mkdir -p dist/cep/sounds
mkdir -p dist/cep/js
mkdir -p dist/cep/jsx

# Create src/exec/sounds directory if it doesn't exist
mkdir -p src/exec/sounds

# Ensure app/sounds directory exists to prevent PyInstaller errors
mkdir -p app/sounds
touch app/sounds/.gitkeep
echo "Created app/sounds directory with placeholder"

# Copy static assets that should be part of the CEP extension
echo "Copying static assets to CEP extension directory..."

# Copy src/js if it exists
if [ -d "src/js" ]; then
  echo "Copying src/js to dist/cep/js..."
  cp -r src/js/* dist/cep/js/ || echo "Warning: Could not copy src/js"
fi

# Copy src/jsx if it exists
if [ -d "src/jsx" ]; then
  echo "Copying src/jsx to dist/cep/jsx..."
  cp -r src/jsx/* dist/cep/jsx/ || echo "Warning: Could not copy src/jsx"
fi

# Copy src/exec if it exists (except for sounds which we handle separately)
if [ -d "src/exec" ]; then
  echo "Copying src/exec to dist/cep/exec..."
  find src/exec -type f -not -path "*/sounds/*" -exec cp {} dist/cep/exec/ \; || echo "Warning: Could not copy files from src/exec"
fi

# Check if ffmpeg exists in the expected location
FFMPEG_PATH="dist/cep/exec/ffmpeg"
if [ ! -f "$FFMPEG_PATH" ]; then
  echo "ffmpeg not found at $FFMPEG_PATH, downloading..."
  
  # Create temp directory for download
  mkdir -p ffmpeg_temp
  
  # Download ffmpeg for macOS
  curl -L https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip -o ffmpeg_temp/ffmpeg.zip
  
  # Extract ffmpeg
  unzip -q ffmpeg_temp/ffmpeg.zip -d ffmpeg_temp
  
  # Copy to destination
  cp ffmpeg_temp/ffmpeg "$FFMPEG_PATH"
  chmod +x "$FFMPEG_PATH"
  
  # Clean up
  rm -rf ffmpeg_temp
  
  echo "ffmpeg downloaded and installed to $FFMPEG_PATH"
else
  echo "ffmpeg already exists at $FFMPEG_PATH"
fi

# Clean up any existing PyInstaller output
echo "Cleaning up existing PyInstaller output..."
rm -rf dist/YoutubetoPremiere
rm -rf build/YoutubetoPremiere

# Build the Python app with PyInstaller
echo "Building with PyInstaller..."

# More aggressive cleanup just before PyInstaller runs
rm -rf dist/YoutubetoPremiere
rm -rf build/YoutubetoPremiere
mkdir -p dist
mkdir -p build/YoutubetoPremiere-work

pyinstaller --onedir -y --clean \
  --distpath "./dist" \
  --workpath "./build/YoutubetoPremiere-work" \
  --name YoutubetoPremiere \
  --add-data "app/sounds:sounds" \
  --hidden-import engineio.async_drivers.threading \
  app/YoutubetoPremiere.py

# Copy the executable to CEP directory
if [ -f "dist/YoutubetoPremiere/YoutubetoPremiere" ]; then
  echo "Copying executable to dist/cep/exec/YoutubetoPremiere"
  cp "dist/YoutubetoPremiere/YoutubetoPremiere" "dist/cep/exec/YoutubetoPremiere"
  chmod +x "dist/cep/exec/YoutubetoPremiere"
else
  echo "ERROR: PyInstaller failed to create the executable"
  exit 1
fi

# Copy Python source files
echo "Copying Python source files..."
mkdir -p dist/cep/exec/app
cp app/*.py dist/cep/exec/app/

# Handle sound files from all potential sources
echo "Handling sound files from all sources..."

# Create sounds directory in all required locations
mkdir -p dist/cep/sounds
mkdir -p dist/cep/exec/sounds

# First check app/sounds
if [ -d "app/sounds" ] && [ "$(ls -A app/sounds 2>/dev/null | grep -v .gitkeep)" ]; then
  echo "Copying sound files from app/sounds..."
  cp -r app/sounds/* dist/cep/sounds/ || echo "Note: No sound files copied from app/sounds"
  cp -r app/sounds/* dist/cep/exec/sounds/ || echo "Note: No sound files copied from app/sounds to exec/sounds"
fi

# Then check src/exec/sounds
if [ -d "src/exec/sounds" ] && [ "$(ls -A src/exec/sounds 2>/dev/null)" ]; then
  echo "Copying sound files from src/exec/sounds..."
  cp -r src/exec/sounds/* dist/cep/sounds/ || echo "Note: No sound files copied from src/exec/sounds"
  cp -r src/exec/sounds/* dist/cep/exec/sounds/ || echo "Note: No sound files copied from src/exec/sounds to exec/sounds"
fi

# If no sound files were found, create a placeholder
if [ ! "$(ls -A dist/cep/sounds 2>/dev/null)" ]; then
  echo "No sound files found in any source directory, creating placeholder"
  touch dist/cep/sounds/.gitkeep
fi

# Create manifest.xml file if it doesn't exist
if [ ! -f "dist/cep/CSXS/manifest.xml" ]; then
  echo "Creating CEP extension manifest directory..."
  mkdir -p dist/cep/CSXS
  
  # Create a basic manifest.xml file
  echo "Creating basic manifest.xml file..."
  cat > dist/cep/CSXS/manifest.xml << EOF
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
EOF
fi

# Create a basic index.html if it doesn't exist
if [ ! -f "dist/cep/index.html" ]; then
  echo "Creating basic index.html file..."
  cat > dist/cep/index.html << EOF
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
EOF
fi

# Create a basic JavaScript file if it doesn't exist
if [ ! -f "dist/cep/js/index.js" ]; then
  echo "Creating basic JavaScript file..."
  mkdir -p dist/cep/js
  cat > dist/cep/js/index.js << EOF
// Basic JavaScript for the extension
console.log('YouTube to Premiere Pro extension loaded');
EOF
fi

echo "CEP extension files status:"
find dist/cep -type f | sort

echo "Python build complete!" 