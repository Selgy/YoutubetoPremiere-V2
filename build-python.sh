#!/bin/bash
set -e  # Exit on error

# Create required directories
EXEC_DIR="dist/cep/exec"
SOUNDS_DIR="$EXEC_DIR/sounds"

mkdir -p "$EXEC_DIR"
mkdir -p "$SOUNDS_DIR"

echo "Created output directories"

# Build with PyInstaller
echo "Building with PyInstaller..."
python -m PyInstaller YoutubetoPremiere.spec --distpath build/YoutubetoPremiere

# Copy Python files
echo "Copying Python source files..."
for file in app/*.py; do
  cp "$file" "$EXEC_DIR/"
done

# Copy macOS-specific files
echo "Copying macOS-specific files..."

# Create a script to find ffmpeg on macOS
cat > "$EXEC_DIR/find_ffmpeg.sh" << 'EOF'
#!/bin/bash
# This script detects ffmpeg on macOS
for path in /usr/local/bin/ffmpeg /opt/homebrew/bin/ffmpeg /usr/bin/ffmpeg ~/bin/ffmpeg; do
  if [ -f "$path" ] && [ -x "$path" ]; then
    echo "Found ffmpeg at: $path"
    echo "$path" > "$(dirname "$0")/ffmpeg_path.txt"
    exit 0
  fi
done

# Try to find via which
if command -v ffmpeg >/dev/null 2>&1; then
  echo "Found ffmpeg via PATH: $(which ffmpeg)"
  echo "$(which ffmpeg)" > "$(dirname "$0")/ffmpeg_path.txt"
  exit 0
fi

echo "FFmpeg not found! Please install ffmpeg:"
echo "  brew install ffmpeg"
exit 1
EOF

chmod +x "$EXEC_DIR/find_ffmpeg.sh"

# Create a macOS launcher script
cat > "$EXEC_DIR/launch_mac.sh" << 'EOF'
#!/bin/bash
# This script launches the YoutubetoPremiere server on macOS

# Navigate to script directory
cd "$(dirname "$0")"

# Check if Python 3 is installed
if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display notification "Python 3 is required but not found. Please install Python 3." with title "YoutubetoPremiere Error"'
  echo "Python 3 is required but not found!"
  exit 1
fi

# Check if server is already running
if nc -z localhost 3001 >/dev/null 2>&1; then
  echo "YoutubetoPremiere server is already running"
  osascript -e 'display notification "YoutubetoPremiere server is already running" with title "YoutubetoPremiere"'
  exit 0
fi

# Run the find_ffmpeg script
./find_ffmpeg.sh >/dev/null 2>&1

# Launch the server
python3 YoutubetoPremiere.py &

# Show notification
osascript -e 'display notification "YoutubetoPremiere server has started" with title "YoutubetoPremiere"'
echo "YoutubetoPremiere server has started"
EOF

chmod +x "$EXEC_DIR/launch_mac.sh"

# Copy sounds if they exist
if [ -d "app/sounds" ]; then
  echo "Copying sound files..."
  cp app/sounds/* "$SOUNDS_DIR/"
fi

# Create macOS info file
cat > "$EXEC_DIR/macOS_INFO.txt" << 'EOF'
YoutubetoPremiere - macOS Version

Requirements:
1. Python 3 (3.6 or higher)
2. FFmpeg

For best experience:
1. Install FFmpeg via Homebrew:
   brew install ffmpeg

2. Launch using the provided script:
   ./launch_mac.sh

The extension will automatically detect your FFmpeg installation.
EOF

echo "Build completed successfully!" 