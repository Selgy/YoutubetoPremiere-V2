# YouTube to Premiere Pro Extension (V2)

A powerful extension that allows direct import of YouTube videos into Adobe Premiere Pro projects.

## Features

- Download entire YouTube videos directly into Premiere Pro
- Extract specific clips with precise timestamp controls
- Extract audio only from YouTube videos 
- Preserve chapter information from YouTube videos
- Automatically create project bins for organized content
- Real-time download and processing status

## Installation

### Method 1: Using ZXP Installer (Recommended)

1. Download the latest ZXP file from the [Releases page](https://github.com/yourusername/YoutubetoPremiere-V2/releases)
2. Install using [Adobe Exchange](https://exchange.adobe.com/creativecloud.details.123456.html) or an extension manager:
   - [Anastasiy's Extension Manager](https://exchange.adobe.com/creativecloud/install-instructions.12d4e3.html) (recommended)
   - [ZXP Installer](https://aescripts.com/learn/zxp-installer/)

### Method 2: Manual Installation (Advanced)

1. Download the ZXP file
2. Extract the contents to:
   - Windows: `C:\Users\[USERNAME]\AppData\Roaming\Adobe\CEP\extensions\com.youtubetoPremiereV2.cep`
   - macOS: `/Library/Application Support/Adobe/CEP/extensions/com.youtubetoPremiereV2.cep`
3. Launch Premiere Pro and the extension should appear under Window > Extensions

## Usage

1. Open Premiere Pro and create or open a project
2. Launch the extension from Window > Extensions > YouTube to Premiere Pro
3. Browse to a YouTube video or paste a YouTube URL
4. Choose your download option:
   - Download entire video
   - Extract clip (select start and end times)
   - Download audio only
5. Click "Download" to start the process
6. The video will be automatically imported into your project

## Requirements

- Adobe Premiere Pro CC 2019 or later
- Internet connection
- Windows 10/11 or macOS 10.14+

## Troubleshooting

### macOS Users

If you encounter permission issues when running the extension on macOS:

1. Open the extension folder: `/Library/Application Support/Adobe/CEP/extensions/com.youtubetoPremiereV2.cep/exec`
2. Run the permission fix script: `chmod +x fix-permissions.sh && ./fix-permissions.sh`

### Windows Users

If the extension cannot find ffmpeg:

1. Make sure you have ffmpeg.exe installed or available in your PATH
2. If ffmpeg isn't found automatically, you can manually set its path in the extension settings

### Common Issues

- **Extension doesn't launch**: Make sure your Creative Cloud Desktop app is running
- **Videos don't download**: Check your internet connection and try a different YouTube URL
- **Import fails**: Make sure your Premiere Pro project is open and active

## Building from Source

### Prerequisites

- Node.js 14+ and Yarn
- Python 3.9+
- Adobe CEP Extension tools

### Build Steps

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/YoutubetoPremiere-V2.git
   cd YoutubetoPremiere-V2
   ```

2. Install dependencies:
   ```
   yarn install
   pip install -r requirements.txt
   ```

3. Build the extension:
   ```
   yarn build
   ```

4. Package as ZXP:
   ```
   yarn zxp
   ```

The packaged ZXP will be created in the `dist/zxp` directory.

## License

This software is provided under the terms of the MIT license. See the LICENSE file for details.

## Credits

- Uses [yt-dlp](https://github.com/yt-dlp/yt-dlp) for YouTube video processing
- Built with Adobe CEP framework
- Incorporates ffmpeg for video processing

## Vérification du package ZXP

Vous pouvez vérifier que tous les exécutables sont correctement inclus dans le package ZXP avant de le distribuer:

```powershell
# Windows PowerShell
pwsh verify-zxp-contents.ps1 dist/zxp/YoutubetoPremiere-v3.0.1.zxp
```

Le script de vérification affichera la liste de tous les fichiers essentiels et confirmera que les exécutables pour Windows et macOS sont bien présents.

## Scripts utilitaires

### Correction des permissions sur macOS

Pour les utilisateurs macOS, un script de correction des permissions est fourni:

```bash
chmod +x scripts/fix-macos-permissions.sh
./scripts/fix-macos-permissions.sh
```

Ce script cherchera l'installation de l'extension et corrigera les permissions des exécutables macOS.
