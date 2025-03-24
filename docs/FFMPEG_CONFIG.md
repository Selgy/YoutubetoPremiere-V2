# Configuration et gestion de FFmpeg

Ce document explique comment YoutubetoPremiere utilise et gère FFmpeg, un composant essentiel pour le traitement des vidéos.

## Importance de FFmpeg

FFmpeg est utilisé pour de nombreuses opérations critiques dans l'extension :

- Conversion de formats vidéo
- Extraction audio
- Découpage de segments vidéo
- Réencodage pour compatibilité avec Premiere Pro
- Extraction des métadonnées
- Génération de thumbnails
- Création de fichiers proxy

## Gestion sur Windows

Sur Windows, FFmpeg est automatiquement géré de la manière suivante :

1. **Inclusion dans le package** : Une version précompilée de FFmpeg est incluse dans le package d'installation
2. **Localisation** : FFmpeg est stocké dans `%APPDATA%\YoutubetoPremiere\bin\ffmpeg.exe`
3. **Mise à jour** : L'exécutable est mis à jour automatiquement lors des mises à jour de l'extension
4. **Backup** : Une copie de sauvegarde est maintenue en cas de corruption du fichier principal

L'utilisateur Windows n'a généralement aucune configuration à effectuer pour que FFmpeg fonctionne correctement.

## Gestion sur macOS

Sur macOS, l'extension utilise une approche plus flexible pour gérer FFmpeg :

1. **Détection automatique** : L'application cherche FFmpeg dans plusieurs emplacements courants :
   - `/usr/local/bin/ffmpeg` (installation Homebrew standard)
   - `/opt/homebrew/bin/ffmpeg` (installation Homebrew sur Apple Silicon)
   - `/usr/bin/ffmpeg` (installation système)
   - `/opt/local/bin/ffmpeg` (installation MacPorts)
   - `~/bin/ffmpeg` (installation utilisateur)

2. **Inclusion conditionnelle** : Une version précompilée de FFmpeg est fournie dans l'extension et utilisée si aucune installation n'est trouvée

3. **Mémorisation** : L'emplacement de FFmpeg est stocké dans `~/Library/Application Support/YoutubetoPremiere/ffmpeg_path.txt` pour éviter de répéter la recherche

4. **Gestion des permissions** : L'extension gère automatiquement les permissions et les attributs de quarantaine pour l'exécutable FFmpeg inclus

## Configuration manuelle

Si l'extension ne parvient pas à localiser FFmpeg automatiquement, les utilisateurs peuvent :

### Sur Windows

1. Télécharger FFmpeg depuis [ffmpeg.org](https://ffmpeg.org/download.html)
2. Extraire le fichier `ffmpeg.exe` 
3. Placer le fichier dans `%APPDATA%\YoutubetoPremiere\bin\`

### Sur macOS

1. Installer FFmpeg via Homebrew (recommandé) :
   ```bash
   brew install ffmpeg
   ```

2. Ou l'installer manuellement et placer le binaire dans un des emplacements listés ci-dessus

3. Redémarrer l'extension pour qu'elle détecte le nouvel emplacement

## Vérification de l'installation

Pour vérifier que FFmpeg est correctement installé et accessible :

### Sur Windows

1. Ouvrez une invite de commande
2. Exécutez :
   ```
   %APPDATA%\YoutubetoPremiere\bin\ffmpeg.exe -version
   ```

### Sur macOS

1. Ouvrez le Terminal
2. Exécutez :
   ```bash
   which ffmpeg
   ffmpeg -version
   ```

## Versions et compatibilité

L'extension est testée et compatible avec :

- FFmpeg 4.x et 5.x
- Builds statiques officiels de ffmpeg.org
- Builds Homebrew et MacPorts pour macOS
- Builds Zeranoe/BtbN pour Windows

## Résolution des problèmes

Si vous rencontrez des problèmes liés à FFmpeg :

1. **L'extension ne trouve pas FFmpeg** :
   - Vérifiez que FFmpeg est correctement installé dans un des emplacements standard
   - Installez-le manuellement via Homebrew (macOS) ou téléchargez-le (Windows)

2. **Erreurs de permissions** :
   - Sur macOS, exécutez `chmod +x /chemin/vers/ffmpeg`
   - Sur Windows, exécutez l'application en tant qu'administrateur

3. **Erreurs de traitement vidéo** :
   - Vérifiez que vous utilisez une version récente de FFmpeg
   - Consultez les logs de l'application pour voir les commandes FFmpeg exactes qui échouent

## Avancé : Utiliser une version spécifique de FFmpeg

Pour les utilisateurs avancés qui nécessitent une version spécifique de FFmpeg :

1. Installez la version souhaitée de FFmpeg
2. Créez ou modifiez le fichier de configuration :
   - Windows : `%APPDATA%\YoutubetoPremiere\config.json`
   - macOS : `~/Library/Application Support/YoutubetoPremiere/config.json`
3. Ajoutez ou modifiez la ligne suivante :
   ```json
   {
     "ffmpeg_path": "/chemin/complet/vers/ffmpeg"
   }
   ```
4. Redémarrez l'extension pour appliquer les changements 