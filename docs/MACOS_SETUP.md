# Installation et utilisation sur macOS

Ce document explique comment installer et utiliser l'extension YoutubetoPremiere sur macOS.

## Prérequis

Avant d'installer YoutubetoPremiere, assurez-vous d'avoir :

1. **Adobe Premiere Pro** (version 2018 ou ultérieure)
2. **Un navigateur Chrome** à jour
3. **Une connexion Internet** active
4. **FFmpeg** installé (instructions ci-dessous)

## Installation de FFmpeg

FFmpeg est nécessaire pour le traitement des vidéos. Vous avez deux options pour l'installer :

### Option 1 : Installer via Homebrew (recommandé)

1. Si vous n'avez pas Homebrew, installez-le en exécutant dans le Terminal :
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Installez FFmpeg en exécutant :
   ```bash
   brew install ffmpeg
   ```

### Option 2 : Installation manuelle

1. Téléchargez FFmpeg depuis [ffmpeg.org](https://ffmpeg.org/download.html)
2. Extrayez le contenu dans un dossier de votre choix
3. Ajoutez ce dossier à votre PATH ou YoutubetoPremiere le détectera automatiquement à certains emplacements courants

## Installation de l'extension

### Méthode 1 : Installation avec ZXP Installer (recommandée)

1. Téléchargez le fichier `.zxp` depuis la page des [releases](https://github.com/votre-repo/YoutubetoPremiere/releases)
2. Téléchargez et installez [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Ouvrez ZXP Installer et faites glisser le fichier `.zxp` dans la fenêtre
4. Suivez les instructions à l'écran pour terminer l'installation

### Méthode 2 : Installation manuelle

Si ZXP Installer ne fonctionne pas :

1. Téléchargez le fichier `.zxp` et décompressez-le (renommez-le en `.zip` si nécessaire)
2. Créez le dossier d'extensions si nécessaire :
   ```bash
   mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions/
   ```
3. Copiez le dossier décompressé dans ce répertoire :
   ```bash
   cp -R [dossier_décompressé] ~/Library/Application\ Support/Adobe/CEP/extensions/YoutubetoPremiere
   ```

### Installation de l'extension Chrome

1. Décompressez le dossier `chrome-extension` du fichier `.zip` fourni
2. Ouvrez Chrome et accédez à `chrome://extensions/`
3. Activez le "Mode développeur" (en haut à droite)
4. Cliquez sur "Charger l'extension non empaquetée"
5. Sélectionnez le dossier `chrome-extension` décompressé

## Configuration initiale

La première fois que vous lancez l'extension dans Premiere Pro :

1. Ouvrez Adobe Premiere Pro
2. Allez dans Fenêtre > Extensions > YoutubetoPremiere
3. Si une boîte de dialogue de sécurité apparaît, suivez les instructions dans notre document [MACOS_PERMISSIONS.md](./MACOS_PERMISSIONS.md)
4. L'extension vous demandera d'autoriser la communication avec Chrome
5. Suivez les instructions à l'écran pour compléter la configuration

## Utilisation de l'extension

### Importer depuis YouTube

1. Ouvrez YouTube dans Chrome
2. Naviguez vers la vidéo que vous souhaitez importer
3. Cliquez sur le bouton "Importer dans Premiere" qui apparaît sur la page YouTube
4. Sélectionnez les options d'importation dans le menu qui s'affiche :
   - Vidéo complète
   - Clip (sélectionnez un segment)
   - Audio uniquement
5. Attendez que le téléchargement et le traitement soient terminés

### Options avancées

Dans l'extension Premiere Pro, vous pouvez configurer :

1. **Qualité de téléchargement** - Choisissez entre différentes résolutions
2. **Format de fichier** - Sélectionnez le codec et le format préférés
3. **Dossier de destination** - Choisissez où enregistrer les fichiers téléchargés
4. **Paramètres de proxy** - Configurez la création automatique de fichiers proxy

## Résolution des problèmes courants

### Problèmes de permissions

Si vous rencontrez des erreurs liées aux permissions ou à la sécurité sur macOS :

1. Consultez notre document [MACOS_PERMISSIONS.md](./MACOS_PERMISSIONS.md) pour des instructions détaillées
2. Assurez-vous que FFmpeg est correctement installé et accessible

### L'extension ne s'ouvre pas dans Premiere Pro

1. Vérifiez que l'extension est correctement installée :
   ```bash
   ls -la ~/Library/Application\ Support/Adobe/CEP/extensions/YoutubetoPremiere
   ```
2. Assurez-vous que les fichiers ont les bonnes permissions :
   ```bash
   chmod -R 755 ~/Library/Application\ Support/Adobe/CEP/extensions/YoutubetoPremiere
   ```

### L'extension Chrome ne se connecte pas

1. Vérifiez que l'extension Chrome est installée et activée
2. Assurez-vous que le serveur local est en cours d'exécution :
   - Ouvrez l'Activité du système
   - Vérifiez si `YoutubetoPremiere` est en cours d'exécution
   - Si ce n'est pas le cas, redémarrez Premiere Pro

### Erreurs de téléchargement

Si vous rencontrez des erreurs lors du téléchargement :

1. Vérifiez votre connexion Internet
2. Assurez-vous que la vidéo n'est pas restreinte ou privée
3. Vérifiez que FFmpeg est correctement installé :
   ```bash
   which ffmpeg
   ```
4. Vérifiez l'espace disponible sur votre disque dur

## Désinstallation

Pour désinstaller complètement l'extension :

1. Supprimez le dossier de l'extension :
   ```bash
   rm -rf ~/Library/Application\ Support/Adobe/CEP/extensions/YoutubetoPremiere
   ```
2. Supprimez l'extension Chrome :
   - Ouvrez Chrome et accédez à `chrome://extensions/`
   - Trouvez l'extension YoutubetoPremiere et cliquez sur "Supprimer"
3. Supprimez les fichiers de données de l'application :
   ```bash
   rm -rf ~/Library/Application\ Support/YoutubetoPremiere
   ```

## Support technique

Si vous rencontrez des problèmes non résolus par ce guide :

1. Consultez notre [FAQ](https://github.com/votre-repo/YoutubetoPremiere/wiki/FAQ)
2. Vérifiez les [problèmes connus](https://github.com/votre-repo/YoutubetoPremiere/issues)
3. Soumettez un nouveau problème avec :
   - Une description détaillée
   - Les étapes pour reproduire le problème
   - Une capture d'écran ou une vidéo de l'erreur
   - Votre version de macOS et de Premiere Pro
   - Le résultat des commandes suivantes :
     ```bash
     which ffmpeg
     sw_vers
     ls -la ~/Library/Application\ Support/Adobe/CEP/extensions/YoutubetoPremiere/exec
     ``` 