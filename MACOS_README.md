# YoutubetoPremiere for macOS

This extension allows you to download YouTube videos directly into Adobe Premiere Pro on macOS.

## Requirements

1. **macOS 10.14 (Mojave)** or later
2. **Python 3.6+** installed
3. **FFmpeg** installed
4. **Adobe Premiere Pro** (latest version recommended)

## Installation Instructions

### Step 1: Install FFmpeg
FFmpeg is required for video processing. Install it using [Homebrew](https://brew.sh/):

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFmpeg
brew install ffmpeg
```

Alternatively, you can download FFmpeg from [the official site](https://ffmpeg.org/download.html).

### Step 2: Install the Extension

1. Extract the extension ZIP file
2. Copy the entire folder to your Adobe CEP extensions folder:
   ```
   ~/Library/Application Support/Adobe/CEP/extensions/
   ```
   (You may need to create this directory if it doesn't exist)
3. Enable loading of unsigned extensions in Adobe Premiere Pro by running the following command in Terminal:
   ```
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   ```
   (Adjust the CSXS version number if needed for your Adobe installation)

### Step 3: Launching the Server

1. Open Finder and navigate to the extension's directory
2. Open the `exec` folder
3. Double-click the `launch_mac.sh` script
   - If it doesn't run, open Terminal and execute:
     ```
     chmod +x /path/to/launch_mac.sh
     /path/to/launch_mac.sh
     ```

### Step 4: Using the Extension

1. Open Adobe Premiere Pro
2. Go to Window > Extensions > YoutubetoPremiere
3. The extension panel should appear
4. Use the Chrome extension to download YouTube videos

## Troubleshooting

### FFmpeg Not Found
If you get an error about FFmpeg not being found:
1. Make sure FFmpeg is installed: `which ffmpeg`
2. If installed but not found, manually edit the `ffmpeg_path.txt` file in the `exec` directory to point to your FFmpeg installation

### Server Connection Issues
If the extension can't connect to the server:
1. Make sure the server is running (run `launch_mac.sh`)
2. Check if another instance is already running: `lsof -i :3001`
3. If a process is already using port 3001, you can stop it: `kill -9 [PID]`

### Extension Not Loading
If the extension doesn't appear in Premiere Pro:
1. Make sure you've enabled loading of unsigned extensions
2. Try restarting Premiere Pro
3. Check Adobe's CEP logs for errors:
   ```
   ~/Library/Logs/CSXS
   ```

## Support

For additional help, visit our support page or contact support@youtubetopremiereapp.com.

---

© 2025 YoutubetoPremiere 