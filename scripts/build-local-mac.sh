#!/bin/bash

# Script de build local pour macOS
# Reproduit les étapes du workflow GitHub Actions pour macOS

set -e

echo "🍎 Début du build local macOS..."

# Variables d'environnement
export NODE_VERSION="18"
export PYTHON_VERSION="3.10.11"
export NO_WATCH=true

# Génération du version et build ID
BUILD_ID=$(date +'%Y%m%d-%H%M%S')
PACKAGE_VERSION=$(node -p "require('./package.json').version")
VERSION="${PACKAGE_VERSION}-local.${BUILD_ID}"

echo "📋 Version: $VERSION"
echo "🆔 Build ID: $BUILD_ID"

# Vérification des prérequis
echo "🔍 Vérification des prérequis..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trouvé. Veuillez installer Node.js $NODE_VERSION"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "❌ Python non trouvé. Veuillez installer Python $PYTHON_VERSION"
    exit 1
fi

if ! command -v yarn &> /dev/null; then
    echo "❌ Yarn non trouvé. Veuillez installer Yarn"
    exit 1
fi

# Nettoyage des builds précédents
echo "🧹 Nettoyage..."
rm -rf dist/
rm -rf pkgroot/
rm -f *.pkg

# Installation des dépendances
echo "📦 Installation des dépendances Node.js..."
yarn install --frozen-lockfile

echo "🐍 Installation des dépendances Python..."
python3 -m pip install --upgrade pip setuptools wheel
pip3 install -r requirements.txt

# Setup FFmpeg
echo "🎬 Configuration de FFmpeg..."
mkdir -p app/exec
if [ ! -f app/exec/ffmpeg ]; then
    echo "📥 Téléchargement de FFmpeg..."
    curl -L https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip -o ffmpeg.zip
    unzip -q ffmpeg.zip
    mv ffmpeg app/exec/
    chmod +x app/exec/ffmpeg
    rm ffmpeg.zip
    echo "✅ FFmpeg installé"
else
    echo "✅ FFmpeg déjà présent"
fi

# Build de l'application
echo "🔨 Build de l'application..."
yarn build

# Vérification du build
if [ ! -d "dist" ]; then
    echo "❌ Erreur: Le dossier dist n'a pas été créé"
    exit 1
fi

# Préparation du contenu PKG
echo "📦 Préparation du contenu PKG..."
mkdir -p pkgroot

# Recherche du dossier de l'application
APP_FOLDER=$(find dist -name "*YoutubetoPremiere*" -type d | head -1)
if [ -z "$APP_FOLDER" ]; then
    echo "❌ Erreur: Dossier YoutubetoPremiere non trouvé dans dist/"
    echo "Contenu de dist/:"
    ls -la dist/
    exit 1
fi

echo "📂 Copie du dossier: $APP_FOLDER"
cp -R "$APP_FOLDER" "./pkgroot/"

# Assurer les permissions exécutables
echo "🔐 Configuration des permissions..."
find ./pkgroot -type f -perm +111 -exec chmod +x {} \;

# Vérification des scripts
if [ ! -d "scripts" ]; then
    echo "⚠️  Dossier scripts non trouvé, création..."
    mkdir -p scripts
fi

if [ ! -f "scripts/postinstall" ]; then
    echo "⚠️  Script postinstall non trouvé, création d'un script basique..."
    cat > scripts/postinstall << 'EOF'
#!/bin/bash
# Script post-installation basique
echo "Installation de YouTube to Premiere Pro terminée"
exit 0
EOF
fi

chmod +x ./scripts/postinstall

# Build du PKG
echo "🏗️  Construction du PKG..."
INSTALLER_NAME="YoutubetoPremiere_macOS_${VERSION}.pkg"

pkgbuild --root "./pkgroot" \
    --identifier "com.selgy.youtubetopremiere" \
    --version "$VERSION" \
    --install-location "/Applications" \
    --scripts "./scripts" \
    "$INSTALLER_NAME"

# Vérification finale
if [ -f "$INSTALLER_NAME" ]; then
    echo "✅ Installateur créé avec succès: $INSTALLER_NAME"
    echo "📊 Taille: $(du -h "$INSTALLER_NAME" | cut -f1)"
    echo ""
    echo "🚀 Pour installer:"
    echo "   sudo installer -pkg '$INSTALLER_NAME' -target /"
    echo ""
    echo "📁 L'application sera installée dans /Applications/"
else
    echo "❌ Erreur: Impossible de créer l'installateur"
    exit 1
fi

echo "🎉 Build local macOS terminé avec succès!" 