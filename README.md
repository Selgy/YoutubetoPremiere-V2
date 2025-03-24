# YoutubetoPremiere

Extension Adobe Premiere Pro pour télécharger et importer des vidéos YouTube directement dans vos projets.

<p align="center">
  <img src="app/images/logo.png" alt="YoutubetoPremiere Logo" width="200">
</p>

## Fonctionnalités

- Téléchargement direct depuis YouTube vers Premiere Pro
- Importation de vidéos complètes, de clips spécifiques ou d'audio uniquement
- Interface intégrée à YouTube (bouton d'importation)
- Préservation des chapitres YouTube
- Marqueurs de chapitres automatiques
- Options de format et de qualité configurables
- Historique des téléchargements
- Support multiplateforme (Windows et macOS)

## Installation

### Windows
Consultez le [guide d'installation Windows](docs/WINDOWS_SETUP.md) pour les instructions détaillées.

### macOS
Consultez le [guide d'installation macOS](docs/MACOS_SETUP.md) pour les instructions détaillées.

Si vous rencontrez des problèmes de permissions sur macOS, consultez notre [guide des permissions macOS](docs/MACOS_PERMISSIONS.md).

## Utilisation rapide

1. Ouvrez Adobe Premiere Pro
2. Allez dans Fenêtre > Extensions > YoutubetoPremiere
3. Ouvrez Chrome et naviguez vers une vidéo YouTube
4. Cliquez sur le bouton "Importer dans Premiere" qui apparaît sur la page
5. Sélectionnez vos options et attendez que l'importation se termine

## Captures d'écran

<p align="center">
  <img src="docs/screenshots/youtube-button.png" alt="YouTube Button" width="400">
  <br>
  <em>Bouton d'importation sur YouTube</em>
</p>

<p align="center">
  <img src="docs/screenshots/premiere-panel.png" alt="Premiere Panel" width="400">
  <br>
  <em>Panneau dans Premiere Pro</em>
</p>

## Configuration requise

- Adobe Premiere Pro (version 2018 ou ultérieure)
- Navigateur Chrome (dernière version)
- Connexion Internet stable
- Windows 10/11 ou macOS 10.14+
- FFmpeg (automatiquement inclus pour Windows, voir [guide FFmpeg](docs/FFMPEG_CONFIG.md) pour plus de détails)

## Résolution des problèmes

Si vous rencontrez des problèmes :

1. Consultez les guides spécifiques à votre système d'exploitation :
   - [Guide Windows](docs/WINDOWS_SETUP.md)
   - [Guide macOS](docs/MACOS_SETUP.md)
   - [Permissions macOS](docs/MACOS_PERMISSIONS.md)
   - [Configuration FFmpeg](docs/FFMPEG_CONFIG.md)

2. Vérifiez que toutes les dépendances sont correctement installées
3. Assurez-vous que l'extension Chrome est activée
4. Redémarrez Adobe Premiere Pro et votre navigateur
5. Consultez notre [Changelog](CHANGELOG.md) pour voir si votre problème a été résolu dans une version récente

## Développement

### Structure du projet

```
YoutubetoPremiere/
├── app/                   # Application CEP (interface Premiere Pro)
├── chrome-extension/      # Extension Chrome
├── server/                # Serveur Python backend
├── .github/               # Configuration CI/CD
└── build/                 # Scripts de build
```

### Installation pour le développement

```bash
# Cloner le dépôt
git clone https://github.com/username/YoutubetoPremiere.git
cd YoutubetoPremiere

# Installer les dépendances
yarn install

# Démarrer le mode développement
yarn dev
```

## Licence

Ce logiciel est protégé par droit d'auteur. Tous droits réservés.

## Crédits

- Développé par [Votre Nom](https://github.com/username)
- Utilise [yt-dlp](https://github.com/yt-dlp/yt-dlp) pour le téléchargement
- Logo et design par [Designer]

## Contact

Pour toute question ou support, veuillez créer un [ticket](https://github.com/username/YoutubetoPremiere/issues) ou contacter support@exemple.com
