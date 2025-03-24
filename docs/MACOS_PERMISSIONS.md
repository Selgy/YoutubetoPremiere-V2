# Gestion des permissions macOS pour YoutubetoPremiere

Ce document explique comment l'extension YoutubetoPremiere gère les permissions des exécutables sur macOS et comment résoudre manuellement les problèmes courants.

## Fonctionnement automatique

À partir de la version 3.0.0, YoutubetoPremiere inclut un système de gestion automatique des permissions qui s'exécute chaque fois que l'extension est lancée :

1. L'extension détecte qu'elle fonctionne sur macOS
2. Elle vérifie si les exécutables ont l'attribut de quarantaine
3. Elle demande à l'utilisateur la permission de corriger les attributs (via une boîte de dialogue)
4. Elle supprime les attributs de quarantaine et définit les permissions d'exécution
5. Pour plus de sécurité, l'exécutable est copié dans `~/Library/Application Support/YoutubetoPremiere/`

Ce processus se déroule automatiquement au démarrage et ne nécessite généralement aucune intervention de l'utilisateur, à part approuver la boîte de dialogue de permission.

## Problèmes courants et solutions

### 1. Message "L'application est endommagée et ne peut pas être ouverte"

Si vous voyez ce message lorsque vous essayez d'ouvrir l'extension :

1. Ouvrez le Terminal (Applications > Utilitaires > Terminal)
2. Exécutez cette commande pour trouver le chemin de l'extension :
   ```bash
   find ~/Library/Application\ Support/Adobe/CEP/extensions -name "YoutubetoPremiere*" -type d
   ```
3. Naviguez vers le répertoire `exec` de l'extension :
   ```bash
   cd [chemin_trouvé]/exec
   ```
4. Supprimez l'attribut de quarantaine :
   ```bash
   xattr -d com.apple.quarantine YoutubetoPremiere
   xattr -d com.apple.quarantine ffmpeg
   ```
5. Définissez les permissions d'exécution :
   ```bash
   chmod +x YoutubetoPremiere
   chmod +x ffmpeg
   ```

### 2. Message "L'application ne peut pas être ouverte car le développeur ne peut pas être vérifié"

Si vous voyez ce message :

1. Cliquez sur "Annuler" dans la boîte de dialogue
2. Ouvrez les Préférences Système > Sécurité et confidentialité
3. Dans l'onglet "Général", vous devriez voir un message concernant "YoutubetoPremiere"
4. Cliquez sur "Ouvrir quand même"
5. Relancez l'extension dans Adobe Premiere Pro

### 3. FFmpeg introuvable ou non fonctionnel

Si l'application ne peut pas traiter les vidéos en raison de problèmes avec FFmpeg :

1. Installez FFmpeg via Homebrew :
   ```bash
   brew install ffmpeg
   ```
2. Ou téléchargez-le manuellement depuis [ffmpeg.org](https://ffmpeg.org/download.html)
3. Redémarrez l'extension pour qu'elle détecte automatiquement FFmpeg

## Copie de sauvegarde des exécutables

Pour les utilisateurs avancés, l'extension place une copie de sauvegarde des exécutables dans :
```
~/Library/Application Support/YoutubetoPremiere/
```

Si vous rencontrez des problèmes avec les exécutables dans l'extension, vous pouvez utiliser cette copie comme alternative.

## Vérification des permissions

Pour vérifier si les attributs de quarantaine sont présents :

```bash
xattr -l [chemin_vers_executable]
```

Si la commande affiche `com.apple.quarantine`, l'exécutable est en quarantaine.

Pour vérifier les permissions d'exécution :

```bash
ls -la [chemin_vers_executable]
```

Les permissions doivent inclure un `x` pour être exécutable (par exemple : `-rwxr-xr-x`).

## Support technique

Si vous rencontrez toujours des problèmes après avoir suivi ces instructions, veuillez contacter le support technique avec les informations suivantes :

1. La version de macOS que vous utilisez
2. La version d'Adobe Premiere Pro
3. Le message d'erreur exact
4. Le résultat des commandes de vérification des permissions mentionnées ci-dessus 