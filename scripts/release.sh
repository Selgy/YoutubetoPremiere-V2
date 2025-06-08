#!/bin/bash

# =====================================================================
# Script de Release Automatisé - YouTube to Premiere Pro
# =====================================================================
# 
# Utilisation: ./scripts/release.sh <version>
# Exemple: ./scripts/release.sh 3.0.4
# 
# Ce script automatise entièrement le processus de release :
# 1. Met à jour les versions dans tous les fichiers
# 2. Commit les changements
# 3. Crée et pousse le tag
# 4. Déclenche automatiquement le workflow GitHub Actions
# =====================================================================

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'aide
show_usage() {
    echo -e "${BLUE}Usage: $0 <version>${NC}"
    echo -e "${YELLOW}Exemple: $0 3.0.4${NC}"
    echo ""
    echo "Ce script automatise entièrement le processus de release :"
    echo "• Met à jour toutes les versions dans les fichiers"
    echo "• Commit les changements"
    echo "• Crée et pousse le tag"
    echo "• Déclenche le workflow GitHub Actions"
    exit 1
}

# Vérifier les arguments
if [ $# -ne 1 ]; then
    echo -e "${RED}❌ Erreur: Version requise${NC}"
    show_usage
fi

VERSION="$1"

# Valider le format de version (x.y.z)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}❌ Erreur: Format de version invalide. Utilisez le format x.y.z (ex: 3.0.4)${NC}"
    exit 1
fi

echo -e "${BLUE}🚀 Démarrage du processus de release pour la version ${VERSION}${NC}"

# Vérifier qu'on est dans la racine du projet
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erreur: Exécutez ce script depuis la racine du projet${NC}"
    exit 1
fi

# Vérifier que git est propre
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Erreur: Le dépôt git contient des changements non commités${NC}"
    echo "Commitez ou stashez vos changements avant de continuer."
    git status --short
    exit 1
fi

# Vérifier qu'on est sur la bonne branche
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "Pre-released" ]; then
    echo -e "${YELLOW}⚠️  Vous êtes sur la branche '$CURRENT_BRANCH'${NC}"
    echo -e "${YELLOW}   Il est recommandé d'être sur 'main' ou 'Pre-released'${NC}"
    read -p "Continuer quand même ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo -e "${BLUE}📋 Mise à jour des versions dans tous les fichiers...${NC}"

# 1. Mettre à jour package.json
echo -e "${BLUE}  → package.json${NC}"
if [ -f "package.json" ]; then
    # Utiliser jq si disponible, sinon sed
    if command -v jq >/dev/null 2>&1; then
        jq ".version = \"$VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
    else
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
    fi
    echo -e "${GREEN}    ✅ Version mise à jour dans package.json${NC}"
else
    echo -e "${YELLOW}    ⚠️  package.json non trouvé${NC}"
fi

# 2. Mettre à jour l'extension Chrome
echo -e "${BLUE}  → ChromeExtension/manifest.json${NC}"
if [ -f "ChromeExtension/manifest.json" ]; then
    if command -v jq >/dev/null 2>&1; then
        jq ".version = \"$VERSION\"" ChromeExtension/manifest.json > ChromeExtension/manifest.json.tmp && mv ChromeExtension/manifest.json.tmp ChromeExtension/manifest.json
    else
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" ChromeExtension/manifest.json
    fi
    echo -e "${GREEN}    ✅ Version mise à jour dans ChromeExtension/manifest.json${NC}"
else
    echo -e "${YELLOW}    ⚠️  ChromeExtension/manifest.json non trouvé${NC}"
fi

# 3. Mettre à jour les fichiers de contenu Chrome Extension
echo -e "${BLUE}  → ChromeExtension/background.js${NC}"
if [ -f "ChromeExtension/background.js" ]; then
    sed -i '' "s/Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version $VERSION/g" ChromeExtension/background.js
    echo -e "${GREEN}    ✅ Version mise à jour dans background.js${NC}"
else
    echo -e "${YELLOW}    ⚠️  ChromeExtension/background.js non trouvé${NC}"
fi

echo -e "${BLUE}  → ChromeExtension/content.js${NC}"
if [ -f "ChromeExtension/content.js" ]; then
    sed -i '' "s/Version [0-9]\+\.[0-9]\+\.[0-9]\+/Version $VERSION/g" ChromeExtension/content.js
    echo -e "${GREEN}    ✅ Version mise à jour dans content.js${NC}"
else
    echo -e "${YELLOW}    ⚠️  ChromeExtension/content.js non trouvé${NC}"
fi

# 4. Mettre à jour project.config.js
echo -e "${BLUE}  → project.config.js${NC}"
if [ -f "project.config.js" ]; then
    sed -i '' "s/version: '[^']*'/version: '$VERSION'/g" project.config.js
    sed -i '' "s/version: \"[^\"]*\"/version: \"$VERSION\"/g" project.config.js
    echo -e "${GREEN}    ✅ Version mise à jour dans project.config.js${NC}"
else
    echo -e "${YELLOW}    ⚠️  project.config.js non trouvé${NC}"
fi

# 5. Mettre à jour vite.config.ts si nécessaire
echo -e "${BLUE}  → vite.config.ts${NC}"
if [ -f "vite.config.ts" ]; then
    # Rechercher et remplacer la version hardcodée
    sed -i '' "s/const currentVersion = process\.env\.APP_VERSION || '[^']*'/const currentVersion = process.env.APP_VERSION || '$VERSION'/g" vite.config.ts
    echo -e "${GREEN}    ✅ Version mise à jour dans vite.config.ts${NC}"
else
    echo -e "${YELLOW}    ⚠️  vite.config.ts non trouvé${NC}"
fi

# 6. Utiliser le script existant tools/version-update.js s'il existe
if [ -f "tools/version-update.js" ]; then
    echo -e "${BLUE}  → Exécution de tools/version-update.js${NC}"
    node tools/version-update.js "$VERSION" || echo -e "${YELLOW}    ⚠️  Erreur lors de l'exécution de version-update.js${NC}"
fi

# 7. Mettre à jour les manifests CEP générés dans les configs vite
echo -e "${BLUE}  → Mise à jour des templates manifest CEP${NC}"
# Ces fichiers sont générés dynamiquement, donc on n'a pas besoin de les modifier

echo -e "${GREEN}✅ Toutes les versions ont été mises à jour vers ${VERSION}${NC}"

# Vérifier qu'il y a des changements à commiter
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}⚠️  Aucun changement détecté. La version était peut-être déjà ${VERSION}${NC}"
    read -p "Continuer avec la création du tag ? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${BLUE}📝 Ajout et commit des changements...${NC}"
    
    # Afficher les fichiers modifiés
    echo -e "${BLUE}Fichiers modifiés :${NC}"
    git status --short
    
    # Ajouter tous les changements
    git add .
    
    # Commit avec un message formaté
    COMMIT_MESSAGE="chore: bump version to ${VERSION}

- Updated package.json version
- Updated Chrome extension manifest version
- Updated project configuration files
- Updated content script version references

Release preparation for v${VERSION}"
    
    git commit -m "$COMMIT_MESSAGE"
    echo -e "${GREEN}✅ Changements commitées${NC}"
fi

# Vérifier si le tag existe déjà
if git tag -l | grep -q "^v${VERSION}$"; then
    echo -e "${RED}❌ Erreur: Le tag v${VERSION} existe déjà${NC}"
    echo "Supprimez-le d'abord avec : git tag -d v${VERSION}"
    echo "Et du remote avec : git push origin :refs/tags/v${VERSION}"
    exit 1
fi

echo -e "${BLUE}🏷️  Création du tag v${VERSION}...${NC}"
git tag -a "v${VERSION}" -m "Release version ${VERSION}

🚀 YouTube to Premiere Pro v${VERSION}

This release includes:
- Updated application version to ${VERSION}
- All extensions and manifests updated
- Ready for distribution via GitHub Actions workflow

Auto-generated release via release script."

echo -e "${GREEN}✅ Tag v${VERSION} créé${NC}"

echo -e "${BLUE}📤 Push des changements et du tag...${NC}"

# Pousser la branche actuelle
echo -e "${BLUE}  → Push de la branche ${CURRENT_BRANCH}${NC}"
git push origin "$CURRENT_BRANCH"

# Pousser le tag
echo -e "${BLUE}  → Push du tag v${VERSION}${NC}"
git push origin "v${VERSION}"

echo -e "${GREEN}✅ Push terminé${NC}"

# Information sur le workflow
echo ""
echo -e "${GREEN}🎉 RELEASE TERMINÉE AVEC SUCCÈS ! 🎉${NC}"
echo ""
echo -e "${BLUE}📋 Résumé :${NC}"
echo -e "   • Version mise à jour : ${GREEN}${VERSION}${NC}"
echo -e "   • Branch: ${GREEN}${CURRENT_BRANCH}${NC}"
echo -e "   • Tag créé : ${GREEN}v${VERSION}${NC}"
echo ""
echo -e "${BLUE}🔗 Actions :${NC}"
echo -e "   • GitHub Actions sera déclenché automatiquement"
echo -e "   • Vérifiez le workflow sur : ${BLUE}https://github.com/Selgy/YoutubetoPremiere-V2/actions${NC}"
echo ""
echo -e "${BLUE}📦 Artefacts attendus :${NC}"
echo -e "   • ${GREEN}YoutubetoPremiere_Mac_arm64_${VERSION}.pkg${NC}"
echo -e "   • ${GREEN}YoutubetoPremiere_Win_${VERSION}.exe${NC}"
echo ""
echo -e "${YELLOW}⏳ Le build prend généralement 15-30 minutes...${NC}"

# Proposer d'ouvrir la page GitHub Actions
if command -v open >/dev/null 2>&1; then
    echo ""
    read -p "Ouvrir la page GitHub Actions maintenant ? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "https://github.com/Selgy/YoutubetoPremiere-V2/actions"
    fi
fi

echo ""
echo -e "${GREEN}🎯 Release script terminé !${NC}" 