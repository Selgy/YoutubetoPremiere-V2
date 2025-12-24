#!/bin/bash

# ⚠️ ATTENTION: Ce script réécrit l'historique Git !
# À utiliser UNIQUEMENT si vous voulez nettoyer les gros binaires de l'historique
# 
# Cela va supprimer app/deno et app/ffmpeg de TOUT l'historique Git
# Réduira considérablement la taille du repo
#
# IMPORTANT: Tous les collaborateurs devront re-cloner le repo après !

set -e

echo "⚠️  ATTENTION: Ce script va réécrire l'historique Git!"
echo ""
echo "Fichiers qui seront supprimés de l'historique:"
echo "  - app/deno (88 MB)"
echo "  - app/ffmpeg (75 MB)"
echo "  - app/deno.exe"
echo "  - app/ffmpeg.exe"
echo ""
echo "Cela réduira la taille du repo de ~160 MB"
echo ""
read -p "Êtes-vous sûr de vouloir continuer? (tapez 'YES' en majuscules): " confirmation

if [ "$confirmation" != "YES" ]; then
    echo "Opération annulée."
    exit 0
fi

echo ""
echo "🔧 Installation de git-filter-repo si nécessaire..."
if ! command -v git-filter-repo &> /dev/null; then
    echo "git-filter-repo n'est pas installé."
    echo "Installation avec pip..."
    pip3 install git-filter-repo
fi

echo ""
echo "🗑️  Suppression des fichiers de l'historique Git..."
git filter-repo --path app/deno --path app/deno.exe --path app/ffmpeg --path app/ffmpeg.exe --invert-paths --force

echo ""
echo "✅ Historique nettoyé!"
echo ""
echo "📋 Prochaines étapes:"
echo "1. Vérifiez que tout fonctionne: git log --all --oneline"
echo "2. Force push vers le remote: git push origin --force --all"
echo "3. Force push les tags: git push origin --force --tags"
echo ""
echo "⚠️  IMPORTANT: Tous les collaborateurs devront re-cloner le repo!"
echo "   Envoyez-leur ce message:"
echo ""
echo "   'Le repo a été nettoyé. Faites un nouveau clone:'"
echo "   'git clone <url>'"

