"""
Configuration pour YoutubetoPremiere
Contient les URLs et paramètres non-sensibles
"""
import os

# URL de l'API de validation de licence
# Par défaut, utilise l'API hébergée sur Vercel
# Peut être surchargée par la variable d'environnement LICENSE_API_URL
LICENSE_API_URL = os.environ.get(
    'LICENSE_API_URL', 
    'https://youtubetopremiere-license-api.imselgy.workers.dev/api/validate-license'
)

# Timeout pour les requêtes API (en secondes)
API_TIMEOUT = 10

# Durée du cache de validation (en secondes)
LICENSE_CACHE_DURATION = 3600  # 1 heure

# Version de l'application
APP_VERSION = "3.0.30"

