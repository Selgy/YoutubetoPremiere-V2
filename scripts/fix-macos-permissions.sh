#!/bin/bash
# Script de correction des permissions pour les exécutables macOS
# Usage: ./fix-macos-permissions.sh [chemin_extension]

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Correction des permissions pour YouTube to Premiere Pro ===${NC}"

# Détecter le chemin de l'extension
if [ "$1" ]; then
  EXTENSION_PATH="$1"
else
  # Chemins d'installation possibles
  POTENTIAL_PATHS=(
    "/Library/Application Support/Adobe/CEP/extensions/com.youtubetoPremiereV2.cep"
    "$HOME/Library/Application Support/Adobe/CEP/extensions/com.youtubetoPremiereV2.cep"
    "./com.youtubetoPremiereV2.cep"
  )
  
  for path in "${POTENTIAL_PATHS[@]}"; do
    if [ -d "$path" ]; then
      EXTENSION_PATH="$path"
      break
    fi
  done
fi

if [ -z "$EXTENSION_PATH" ]; then
  echo -e "${RED}ERREUR: Impossible de trouver le dossier de l'extension.${NC}"
  echo "Veuillez spécifier le chemin de l'extension en argument:"
  echo "./fix-macos-permissions.sh /chemin/vers/com.youtubetoPremiereV2.cep"
  exit 1
fi

echo -e "Utilisation du chemin d'extension: ${YELLOW}$EXTENSION_PATH${NC}"

# Vérifier que le dossier exec existe
EXEC_DIR="$EXTENSION_PATH/exec"
if [ ! -d "$EXEC_DIR" ]; then
  echo -e "${RED}ERREUR: Le dossier 'exec' n'existe pas dans $EXTENSION_PATH${NC}"
  exit 1
fi

echo -e "\n${GREEN}Vérification des exécutables...${NC}"

# Liste des exécutables à corriger
EXECUTABLES=(
  "YoutubetoPremiere"
  "ffmpeg"
)

# Correction des permissions
for exe in "${EXECUTABLES[@]}"; do
  EXE_PATH="$EXEC_DIR/$exe"
  if [ -f "$EXE_PATH" ]; then
    echo -e "Correction des permissions pour ${YELLOW}$exe${NC}..."
    
    # Rendre le fichier exécutable
    chmod +x "$EXE_PATH"
    
    # Tenter de supprimer l'attribut de quarantaine
    if xattr -d com.apple.quarantine "$EXE_PATH" 2>/dev/null; then
      echo -e "  ${GREEN}✓ Attribut de quarantaine supprimé${NC}"
    else
      echo -e "  ${YELLOW}ℹ Pas d'attribut de quarantaine à supprimer${NC}"
    fi
    
    # Vérifier les permissions
    if [ -x "$EXE_PATH" ]; then
      echo -e "  ${GREEN}✓ Permissions d'exécution correctement définies${NC}"
    else
      echo -e "  ${RED}✗ Impossible de définir les permissions d'exécution${NC}"
    fi
  else
    echo -e "${RED}✗ Exécutable non trouvé: $exe${NC}"
  fi
done

# Vérifier le script fix-permissions.sh et le rendre exécutable
FIX_SCRIPT="$EXEC_DIR/fix-permissions.sh"
if [ -f "$FIX_SCRIPT" ]; then
  echo -e "\nCorrection des permissions pour ${YELLOW}fix-permissions.sh${NC}..."
  chmod +x "$FIX_SCRIPT"
  if [ -x "$FIX_SCRIPT" ]; then
    echo -e "  ${GREEN}✓ Permissions d'exécution correctement définies${NC}"
    
    # Exécuter le script intégré
    echo -e "\nExécution du script intégré fix-permissions.sh..."
    "$FIX_SCRIPT"
  else
    echo -e "  ${RED}✗ Impossible de définir les permissions d'exécution${NC}"
  fi
else
  echo -e "${RED}✗ Script fix-permissions.sh non trouvé${NC}"
fi

# Vérification finale
echo -e "\n${GREEN}=== Vérification finale ===${NC}"
for exe in "${EXECUTABLES[@]}"; do
  EXE_PATH="$EXEC_DIR/$exe"
  if [ -f "$EXE_PATH" ] && [ -x "$EXE_PATH" ]; then
    echo -e "${GREEN}✓ $exe est prêt à être utilisé${NC}"
  else
    if [ -f "$EXE_PATH" ]; then
      echo -e "${RED}✗ $exe existe mais n'est pas exécutable${NC}"
    else
      echo -e "${RED}✗ $exe n'existe pas${NC}"
    fi
  fi
done

echo -e "\n${GREEN}=== Correction des permissions terminée ===${NC}"
echo -e "Si des problèmes persistent, essayez de redémarrer Adobe Premiere Pro." 