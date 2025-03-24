# Installation et utilisation sur Windows

Ce document explique comment installer et utiliser l'extension YoutubetoPremiere sur Windows.

## Prérequis

Avant d'installer YoutubetoPremiere, assurez-vous d'avoir :

1. **Adobe Premiere Pro** (version 2018 ou ultérieure)
2. **Un navigateur Chrome** à jour
3. **Une connexion Internet** active

## Installation de l'extension

### Méthode 1 : Installation automatique (recommandée)

1. Téléchargez le dernier installateur `.exe` depuis la page des [releases](https://github.com/votre-repo/YoutubetoPremiere/releases)
2. Exécutez l'installateur en tant qu'administrateur
3. Suivez les instructions à l'écran
4. Redémarrez Adobe Premiere Pro si l'application est déjà ouverte

L'installateur configurera automatiquement :
- L'extension pour Adobe Premiere Pro
- L'extension Chrome nécessaire

### Méthode 2 : Installation manuelle

Si l'installateur automatique ne fonctionne pas :

1. Téléchargez le fichier `.zxp` depuis la page des [releases](https://github.com/votre-repo/YoutubetoPremiere/releases)
2. Téléchargez et installez [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Ouvrez ZXP Installer et faites glisser le fichier `.zxp` dans la fenêtre
4. Installez l'extension Chrome manuellement :
   - Décompressez le dossier `chrome-extension` du fichier `.zip` fourni
   - Ouvrez Chrome et accédez à `chrome://extensions/`
   - Activez le "Mode développeur" (en haut à droite)
   - Cliquez sur "Charger l'extension non empaquetée"
   - Sélectionnez le dossier `chrome-extension` décompressé

## Configuration initiale

La première fois que vous lancez l'extension dans Premiere Pro :

1. Ouvrez Adobe Premiere Pro
2. Allez dans Fenêtre > Extensions > YoutubetoPremiere
3. L'extension vous demandera d'autoriser la communication avec Chrome
4. Suivez les instructions à l'écran pour compléter la configuration

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

### L'extension ne s'ouvre pas dans Premiere Pro

1. Vérifiez que l'extension est correctement installée :
   - Allez dans `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`
   - Vérifiez qu'il existe un dossier `YoutubetoPremiere`
2. Réinstallez l'extension en utilisant l'installateur

### L'extension Chrome ne se connecte pas

1. Vérifiez que l'extension Chrome est installée et activée
2. Assurez-vous que le serveur local est en cours d'exécution :
   - Ouvrez le Gestionnaire des tâches de Windows
   - Vérifiez si `YoutubetoPremiere.exe` est en cours d'exécution
   - Si ce n'est pas le cas, redémarrez Premiere Pro

### Erreurs de téléchargement

Si vous rencontrez des erreurs lors du téléchargement :

1. Vérifiez votre connexion Internet
2. Assurez-vous que la vidéo n'est pas restreinte ou privée
3. Essayez de télécharger en qualité inférieure
4. Vérifiez l'espace disponible sur votre disque dur

## Désinstallation

Pour désinstaller complètement l'extension :

1. Utilisez le Panneau de configuration Windows > Programmes et fonctionnalités
2. Recherchez et désinstallez "YoutubetoPremiere"
3. Supprimez l'extension Chrome :
   - Ouvrez Chrome et accédez à `chrome://extensions/`
   - Trouvez l'extension YoutubetoPremiere et cliquez sur "Supprimer"
4. Supprimez manuellement les fichiers restants :
   - `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\YoutubetoPremiere`
   - `%APPDATA%\YoutubetoPremiere`

## Support technique

Si vous rencontrez des problèmes non résolus par ce guide :

1. Consultez notre [FAQ](https://github.com/votre-repo/YoutubetoPremiere/wiki/FAQ)
2. Vérifiez les [problèmes connus](https://github.com/votre-repo/YoutubetoPremiere/issues)
3. Soumettez un nouveau problème avec :
   - Une description détaillée
   - Les étapes pour reproduire le problème
   - Une capture d'écran ou une vidéo de l'erreur
   - Votre version de Windows et de Premiere Pro 