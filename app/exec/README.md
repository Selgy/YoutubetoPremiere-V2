# Exécutables YouTube to Premiere Pro

Ce dossier contient les exécutables et fichiers essentiels pour le fonctionnement de l'extension YouTube to Premiere Pro.

## Contenu

- `YoutubetoPremiere.exe` - Exécutable Windows
- `YoutubetoPremiere` - Exécutable macOS
- `ffmpeg.exe` - FFmpeg pour Windows
- `ffmpeg` - FFmpeg pour macOS
- `fix-permissions.sh` - Script de correction des permissions pour macOS
- `*.py` - Fichiers Python source

## Problèmes de permissions sur macOS

Si vous rencontrez des problèmes de permissions sur macOS, exécutez la commande suivante dans le Terminal:

```bash
cd "/Library/Application Support/Adobe/CEP/extensions/com.youtubetoPremiereV2.cep/exec"
chmod +x fix-permissions.sh
./fix-permissions.sh
```

Ce script corrigera les permissions pour tous les exécutables et supprimera les attributs de quarantaine qui pourraient bloquer leur exécution.

## Fichiers temporaires

Les fichiers téléchargés sont stockés temporairement dans le dossier `temp` créé automatiquement. Ces fichiers sont nettoyés automatiquement après un certain temps.

## FFmpeg

L'extension utilise FFmpeg pour le traitement vidéo. Les binaires FFmpeg sont inclus pour Windows et macOS. Si vous préférez utiliser votre propre installation de FFmpeg, assurez-vous qu'elle est accessible dans votre PATH système. 