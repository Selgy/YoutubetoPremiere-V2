#!/bin/bash
set -e

# Script for building Python app on macOS

echo "Building Python app for macOS..."

# Create necessary directories
mkdir -p dist/cep/exec
mkdir -p dist/cep/sounds

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

# Build the Python app with PyInstaller
echo "Building with PyInstaller..."
pyinstaller --onefile \
  --name YoutubetoPremiere \
  --add-data "app/sounds:sounds" \
  --hidden-import engineio.async_drivers.threading \
  --hidden-import socketio.async_drivers.threading \
  --hidden-import pkg_resources.py2_warn \
  app/YoutubetoPremiere.py

# Copy the executable to CEP directory
if [ -f "dist/YoutubetoPremiere" ]; then
  echo "Copying executable to dist/cep/exec/YoutubetoPremiere"
  cp "dist/YoutubetoPremiere" "dist/cep/exec/YoutubetoPremiere"
  chmod +x "dist/cep/exec/YoutubetoPremiere"
else
  echo "ERROR: PyInstaller failed to create the executable"
  exit 1
fi

# Copy Python source files
echo "Copying Python source files..."
mkdir -p dist/cep/exec/app
cp app/*.py dist/cep/exec/app/

# Copy sounds if they exist
if [ -d "app/sounds" ] && [ "$(ls -A app/sounds 2>/dev/null)" ]; then
  echo "Copying sound files..."
  mkdir -p dist/cep/sounds
  cp -r app/sounds/* dist/cep/sounds/ || echo "Note: No sound files copied (directory may be empty)"
else
  echo "Sound directory doesn't exist or is empty, creating empty directory"
  mkdir -p dist/cep/sounds
  touch dist/cep/sounds/.gitkeep
fi

echo "Python build complete!" 