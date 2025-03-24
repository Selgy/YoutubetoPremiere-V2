# Changelog

Toutes les modifications notables apportées à ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [À venir]
- Amélioration de la détection des chapitres YouTube
- Support pour les listes de lecture
- Intégration avec d'autres plateformes vidéo

## [3.0.0] - 2023-06-15

### Ajouté
- Système automatique de gestion des permissions sur macOS
- Détection et gestion automatique de FFmpeg sur macOS
- Téléchargement des sous-titres disponibles
- Documentation détaillée pour Windows et macOS

### Modifié
- Refonte complète de l'interface utilisateur
- Optimisation du processus de téléchargement
- Amélioration de la compatibilité avec Premiere Pro 2023

### Corrigé
- Problèmes de permissions sur macOS (quarantaine et exécution)
- Problèmes de connexion entre l'extension Chrome et Premiere Pro
- Erreurs lors du téléchargement de vidéos avec caractères spéciaux
- Stabilité générale et performances

## [2.1.0] - 2023-03-10

### Ajouté
- Support pour les chapitres YouTube
- Option pour extraire l'audio uniquement
- Fonctionnalité de découpage vidéo

### Corrigé
- Problèmes de compatibilité avec les dernières versions de Chrome
- Erreurs de téléchargement avec certains formats vidéo
- Interface qui ne s'affiche pas correctement dans certains cas

## [2.0.0] - 2022-11-25

### Ajouté
- Support complet pour macOS
- Interface entièrement repensée
- Téléchargement de clips vidéo spécifiques
- Historique des téléchargements

### Modifié
- Transition vers Manifest V3 pour l'extension Chrome
- Amélioration de la gestion des erreurs
- Optimisation des performances de téléchargement

### Corrigé
- Nombreux bugs et problèmes de stabilité
- Problèmes de communication WebSocket
- Problèmes d'extraction de métadonnées

## [1.0.0] - 2022-06-30

### Ajouté
- Version initiale
- Support pour Windows uniquement
- Téléchargement de vidéos YouTube complètes
- Importation directe dans Premiere Pro
- Interface de base intégrée à YouTube 