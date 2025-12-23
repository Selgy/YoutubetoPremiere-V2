#!/bin/bash

# Script de build local pour macOS
# YouTube to Premiere Pro Extension

set -e  # Exit on error

echo "🚀 Démarrage du build local pour macOS..."
echo "========================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier qu'on est bien sur macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ Ce script est conçu pour macOS uniquement${NC}"
    exit 1
fi

# Fonction de log
log_step() {
    echo -e "\n${BLUE}➡️  $1${NC}\n"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 1. Vérifier Python 3
log_step "Vérification de Python 3..."
if ! command -v python3 &> /dev/null; then
    log_error "Python 3 n'est pas installé. Installez-le avec: brew install python@3"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
log_success "Python trouvé: $PYTHON_VERSION"

# 2. Vérifier Node.js
log_step "Vérification de Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js n'est pas installé. Installez-le avec: brew install node"
    exit 1
fi
NODE_VERSION=$(node --version)
log_success "Node.js trouvé: $NODE_VERSION"

# 3. Vérifier Yarn
log_step "Vérification de Yarn..."
if ! command -v yarn &> /dev/null; then
    log_error "Yarn n'est pas installé. Installez-le avec: npm install -g yarn"
    exit 1
fi
YARN_VERSION=$(yarn --version)
log_success "Yarn trouvé: $YARN_VERSION"

# 4. Installer les dépendances Python
log_step "Installation des dépendances Python..."
if [ ! -d "venv" ]; then
    log_step "Création de l'environnement virtuel Python..."
    python3 -m venv venv
fi

source venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install --upgrade yt-dlp pyinstaller
log_success "Dépendances Python installées"

# 5. Installer Deno (pour yt-dlp)
log_step "Installation de Deno..."
if ! command -v deno &> /dev/null; then
    echo "Deno n'est pas installé, installation en cours..."
    curl -fsSL https://deno.land/install.sh | sh
    export PATH="$HOME/.deno/bin:$PATH"
fi
DENO_VERSION=$(deno --version | head -n 1)
log_success "Deno trouvé: $DENO_VERSION"

# Télécharger Deno standalone pour le bundle
log_step "Téléchargement de Deno standalone pour le bundle..."
if [ ! -f "app/deno" ]; then
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        DENO_URL="https://github.com/denoland/deno/releases/latest/download/deno-aarch64-apple-darwin.zip"
    else
        DENO_URL="https://github.com/denoland/deno/releases/latest/download/deno-x86_64-apple-darwin.zip"
    fi
    
    curl -fsSL "$DENO_URL" -o deno.zip
    unzip -o deno.zip
    chmod +x deno
    mv deno app/deno
    rm deno.zip
    log_success "Deno standalone téléchargé pour architecture: $ARCH"
else
    log_success "Deno standalone déjà présent"
fi

# Télécharger les scripts EJS challenge solver pour yt-dlp
log_step "Téléchargement des scripts EJS challenge solver via yt-dlp..."
mkdir -p ~/.cache/yt-dlp

# S'assurer que Deno est dans le PATH
export PATH="$HOME/.deno/bin:$PATH"

# Exécuter yt-dlp avec une vidéo de test pour déclencher le téléchargement EJS
# Utiliser --no-download pour extraire seulement les infos (plus rapide)
echo "Déclenchement du téléchargement EJS avec yt-dlp..."
python3 -m yt_dlp --no-download --print "" "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 || true

# Vérifier si EJS a été téléchargé
YTDLP_CACHE="$HOME/.cache/yt-dlp"
echo "Vérification du cache EJS à: $YTDLP_CACHE"

if [ -d "$YTDLP_CACHE" ]; then
    echo "✅ Cache yt-dlp trouvé, copie dans le répertoire app..."
    mkdir -p app/yt-dlp-ejs
    cp -r "$YTDLP_CACHE"/* app/yt-dlp-ejs/ 2>/dev/null || true
    
    echo "Contenu du cache EJS:"
    ls -laR app/yt-dlp-ejs/
    
    # Compter les fichiers
    FILE_COUNT=$(find app/yt-dlp-ejs -type f | wc -l | tr -d ' ')
    if [ "$FILE_COUNT" -gt 0 ]; then
        log_success "Capture réussie de $FILE_COUNT fichiers EJS"
    else
        echo "⚠️ Aucun fichier trouvé dans le cache EJS (yt-dlp n'en avait peut-être pas besoin pour cette vidéo)"
    fi
else
    echo "⚠️ Aucun cache yt-dlp trouvé - les scripts EJS n'ont peut-être pas été téléchargés"
    echo "Cela peut être normal si yt-dlp n'en avait pas besoin pour la vidéo de test"
fi

# 6. Télécharger FFmpeg
log_step "Téléchargement de FFmpeg pour macOS..."
if [ ! -f "ffmpeg" ]; then
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/snapshot/ffmpeg.zip"
    else
        FFMPEG_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/intel64/snapshot/ffmpeg.zip"
    fi
    
    curl -L "$FFMPEG_URL" -o ffmpeg.zip
    unzip -o ffmpeg.zip
    chmod +x ffmpeg
    rm ffmpeg.zip
    log_success "FFmpeg téléchargé pour architecture: $ARCH"
else
    log_success "FFmpeg déjà présent"
fi

# 7. Installer les dépendances Node.js
log_step "Installation des dépendances Node.js..."
yarn install --frozen-lockfile
log_success "Dépendances Node.js installées"

# 8. Build Python application avec PyInstaller
log_step "Build de l'application Python avec PyInstaller..."
pyinstaller --onedir --clean \
  --hidden-import=engineio.async_drivers.threading \
  --hidden-import=engineio.async_drivers \
  --hidden-import=websocket \
  --hidden-import=websockets \
  --hidden-import=wsproto \
  --hidden-import=pygame \
  --hidden-import=flask \
  --hidden-import=flask_cors \
  --hidden-import=flask_socketio \
  --hidden-import=yt_dlp \
  --hidden-import=psutil \
  --hidden-import=tkinter \
  --hidden-import=video_processing \
  --hidden-import=utils \
  --hidden-import=routes \
  --collect-all=yt_dlp \
  --collect-all=flask \
  --collect-all=flask_socketio \
  --collect-all=flask_cors \
  --collect-all=werkzeug \
  --collect-all=psutil \
  --collect-all=requests \
  --collect-all=tqdm \
  --collect-all=pygame \
  --collect-all=curl_cffi \
  --collect-all=python_dotenv \
  --collect-all=eventlet \
  --collect-all=gevent_websocket \
  --collect-all=simple_websocket \
  --add-data "app/sounds:sounds" \
  --add-data "app/*.py:." \
  app/YoutubetoPremiere.py

log_success "Application Python buildée"

# 9. Copier FFmpeg, Deno et le cache yt-dlp dans _internal
log_step "Copie de FFmpeg, Deno et du cache yt-dlp dans le bundle..."
if [ -f "ffmpeg" ]; then
    cp ffmpeg ./dist/YoutubetoPremiere/_internal/ffmpeg
    chmod +x ./dist/YoutubetoPremiere/_internal/ffmpeg
    log_success "FFmpeg copié dans _internal"
else
    log_error "ffmpeg non trouvé"
    exit 1
fi

if [ -f "app/deno" ]; then
    cp app/deno ./dist/YoutubetoPremiere/_internal/deno
    chmod +x ./dist/YoutubetoPremiere/_internal/deno
    log_success "Deno copié dans _internal"
else
    log_error "app/deno non trouvé"
    exit 1
fi

# Copier les scripts yt-dlp EJS dans _internal
log_step "Copie des scripts yt-dlp EJS dans _internal..."
if [ -d "app/yt-dlp-ejs" ]; then
    mkdir -p ./dist/YoutubetoPremiere/_internal/yt-dlp-ejs
    cp -r app/yt-dlp-ejs/* ./dist/YoutubetoPremiere/_internal/yt-dlp-ejs/
    log_success "Scripts yt-dlp EJS copiés dans _internal"
    ls -laR ./dist/YoutubetoPremiere/_internal/yt-dlp-ejs/
else
    echo "⚠️ Aucun répertoire yt-dlp-ejs trouvé à bundler"
fi

# 10. Build CEP Extension
log_step "Build de l'extension CEP..."
export ZXP_PACKAGE=false
yarn build:cep
log_success "Extension CEP buildée"

# 11. Copier l'exécutable Python dans l'extension CEP
log_step "Copie de l'exécutable Python dans l'extension CEP..."
rm -rf ./dist/cep/exec
mkdir -p ./dist/cep/exec
cp -R ./dist/YoutubetoPremiere/* ./dist/cep/exec/
chmod +x ./dist/cep/exec/YoutubetoPremiere
log_success "Exécutable copié dans l'extension CEP"

# 12. Vérifier le dossier sounds
log_step "Vérification des fichiers sons..."
if [ -d "./dist/cep/exec/sounds" ]; then
    log_success "Dossier sounds présent avec les fichiers:"
    ls -la ./dist/cep/exec/sounds/
else
    log_error "Dossier sounds manquant!"
fi

# 13. Définir les permissions exécutables
log_step "Configuration des permissions..."
chmod +x ./dist/YoutubetoPremiere/YoutubetoPremiere
chmod +x ./dist/cep/exec/YoutubetoPremiere
log_success "Permissions configurées"

echo ""
echo "========================================"
echo -e "${GREEN}✨ Build terminé avec succès! ✨${NC}"
echo "========================================"
echo ""
echo "📁 Les fichiers buildés sont disponibles dans:"
echo "   - Application Python: ./dist/YoutubetoPremiere/"
echo "   - Extension CEP: ./dist/cep/"
echo ""
echo "📦 Pour installer l'extension CEP dans Premiere Pro:"
echo "   Copiez le dossier ./dist/cep/ vers:"
echo "   ~/Library/Application Support/Adobe/CEP/extensions/com.selgy.youtubetopremiere/"
echo ""
echo "💡 Note: L'application n'est pas signée. Pour l'utiliser:"
echo "   1. Essayez de lancer l'application"
echo "   2. Si macOS bloque, allez dans Préférences Système > Confidentialité et sécurité"
echo "   3. Cliquez sur 'Ouvrir quand même'"
echo ""




