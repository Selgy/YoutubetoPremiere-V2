# Optimisations de Latence - YouTube to Premiere

## 🔍 Sources de Latence Identifiées

### 1. **Extension Chrome** (content.js) - ~500-1000ms
#### Problèmes actuels :
- **Récupération des cookies** (lignes 48-180 background.js) :
  - Boucle séquentielle sur 9 domaines différents
  - Double extraction (domain + URL-based) pour chaque domaine
  - Chaque appel `chrome.cookies.getAll()` prend ~50-100ms
  - Total : ~900ms juste pour les cookies

- **Taille de la requête** (ligne 2094-2105 content.js) :
  - Envoi de ~25KB de données JSON (72 cookies)
  - Beaucoup de cookies inutiles inclus

#### ✅ Optimisations recommandées :

```javascript
// 1. Paralléliser la récupération des cookies
async function getYouTubeCookies() {
    const domains = ['.youtube.com', 'www.youtube.com', '.google.com'];
    
    // AVANT : Boucle séquentielle (~900ms)
    // APRÈS : Promise.all parallèle (~150ms)
    const cookiePromises = domains.map(domain => 
        chrome.cookies.getAll({ domain }).catch(() => [])
    );
    const cookieArrays = await Promise.all(cookiePromises);
    let allCookies = cookieArrays.flat();
    
    // 2. Ne garder QUE les cookies essentiels
    const essentialCookieNames = [
        'LOGIN_INFO', '__Secure-3PAPISID', '__Secure-3PSID',
        'SAPISID', 'APISID', 'HSID', 'SSID', 'SID'
    ];
    
    return allCookies.filter(c => essentialCookieNames.includes(c.name));
}

// 3. Mettre en cache les cookies pendant 30 secondes
let cookiesCache = { data: null, timestamp: 0 };
async function getCachedCookies() {
    const now = Date.now();
    if (cookiesCache.data && (now - cookiesCache.timestamp) < 30000) {
        return cookiesCache.data;
    }
    cookiesCache.data = await getYouTubeCookies();
    cookiesCache.timestamp = now;
    return cookiesCache.data;
}
```

**Gain estimé : 750ms → 150ms (-600ms, -80%)**

---

### 2. **Serveur Python - Vérification de Licence** (routes.py) - ~1000-3000ms
#### Problème actuel :
- **Ligne 1986-2006 content.js** : Vérification licence AVANT chaque import
- **Ligne 492-508 routes.py** : Appels API externes à Gumroad + Shopify
  - Gumroad : ~500-1500ms
  - Shopify (si Gumroad échoue) : +500-1500ms
  - Timeout si serveurs lents : jusqu'à 5000ms

#### ✅ Optimisations recommandées :

```python
# 1. Cache de validation de licence (routes.py)
license_cache = {'key': None, 'is_valid': False, 'timestamp': 0}
CACHE_DURATION = 3600  # 1 heure

@app.route('/check-license', methods=['GET'])
def check_license():
    license_key = get_license_key()
    now = time.time()
    
    # Vérifier le cache en premier
    if (license_cache['key'] == license_key and 
        license_cache['timestamp'] + CACHE_DURATION > now):
        return jsonify({
            'isValid': license_cache['is_valid'],
            'message': 'License is valid (cached)'
        })
    
    # Sinon, valider normalement...
    # ... puis mettre en cache
    license_cache.update({
        'key': license_key,
        'is_valid': True,
        'timestamp': now
    })
```

```javascript
// 2. Vérification licence côté extension UNIQUEMENT au démarrage
// content.js - vérifier une fois au chargement, puis faire confiance
let licenseValidated = false;

async function validateLicenseOnce() {
    if (licenseValidated) return true;
    
    const response = await fetch('http://localhost:17845/check-license');
    const data = await response.json();
    licenseValidated = data.isValid;
    return licenseValidated;
}

// Valider au chargement de la page
validateLicenseOnce();

// Dans le bouton d'import, ne plus vérifier à chaque fois
```

**Gain estimé : 1000-3000ms → 0ms (après premier check) (-100%)**

---

### 3. **Création du Fichier Cookies** (video_processing.py) - ~100-200ms
#### Problème actuel :
- **Ligne 187-256 video_processing.py** : Création fichier pour chaque téléchargement
- Écriture disque synchrone
- Validation ligne par ligne

#### ✅ Optimisations recommandées :

```python
# Utiliser un seul fichier cookies réutilisable avec un hash
import hashlib

cookies_cache_file = None
cookies_cache_hash = None

def create_cookies_file(cookies_list):
    global cookies_cache_file, cookies_cache_hash
    
    # Calculer hash des cookies
    cookies_str = str(sorted((c['name'], c['value']) for c in cookies_list))
    current_hash = hashlib.md5(cookies_str.encode()).hexdigest()
    
    # Réutiliser le fichier si les cookies n'ont pas changé
    if cookies_cache_hash == current_hash and cookies_cache_file:
        if os.path.exists(cookies_cache_file):
            return cookies_cache_file
    
    # Sinon créer nouveau fichier...
    cookies_cache_hash = current_hash
    cookies_cache_file = new_file_path
    
    return cookies_cache_file
```

**Gain estimé : 150ms → 5ms (-95%)**

---

### 4. **Chargement des Settings** (utils.py) - ~50-100ms
#### Problème actuel :
- **load_settings()** appelé 3-4 fois par téléchargement
- Lecture fichier JSON à chaque fois

#### ✅ Optimisations recommandées :

```python
# Singleton pattern pour settings
_settings_cache = None
_settings_cache_time = 0

def load_settings():
    global _settings_cache, _settings_cache_time
    
    now = time.time()
    if _settings_cache and (now - _settings_cache_time) < 5:
        return _settings_cache.copy()
    
    # Charger depuis le disque
    _settings_cache = _load_settings_from_disk()
    _settings_cache_time = now
    return _settings_cache.copy()
```

**Gain estimé : 200ms → 5ms (-97%)**

---

### 5. **Vérification FFmpeg** (video_processing.py) - ~100-300ms
#### Problème actuel :
- **check_ffmpeg()** appelé à chaque download
- Ligne 633-690 : Exécution de `ffmpeg -version` à chaque fois

#### ✅ Optimisations recommandées :

```python
# Vérifier FFmpeg une seule fois au démarrage
_ffmpeg_verified = False
_ffmpeg_path_cached = None

def check_ffmpeg(settings, socketio):
    global _ffmpeg_verified, _ffmpeg_path_cached
    
    if _ffmpeg_verified and _ffmpeg_path_cached:
        return {'success': True, 'path': _ffmpeg_path_cached}
    
    # Vérification normale...
    _ffmpeg_verified = True
    _ffmpeg_path_cached = ffmpeg_path
    return result
```

**Gain estimé : 200ms → 0ms (-100%)**

---

## 📊 Résumé des Gains de Performance

| Optimisation | Avant | Après | Gain | Priorité |
|--------------|-------|-------|------|----------|
| Cookies Chrome (parallèle) | 900ms | 150ms | -750ms | 🔴 HAUTE |
| Cache validation licence | 2000ms | 0ms | -2000ms | 🔴 HAUTE |
| Fichier cookies réutilisable | 150ms | 5ms | -145ms | 🟡 MOYENNE |
| Cache settings | 200ms | 5ms | -195ms | 🟡 MOYENNE |
| Cache FFmpeg check | 200ms | 0ms | -200ms | 🟡 MOYENNE |
| **TOTAL** | **~3.5s** | **~160ms** | **-3.3s** | **-95%** |

---

## 🚀 Optimisations Avancées (Optionnelles)

### 6. Pré-chauffage des connexions
```javascript
// Extension Chrome - Établir connexion WebSocket persistante
const socket = io('http://localhost:17845');
socket.on('connect', () => console.log('Ready for fast downloads'));
```

### 7. Compression des données
```python
# routes.py - Activer compression gzip
from flask_compress import Compress
compress = Compress(app)
```

### 8. Background download initiation
```javascript
// Démarrer le téléchargement pendant la vérification de licence
Promise.all([
    validateLicense(),
    startPreparingDownload()  // Pré-créer structures
]).then(([isValid, prepared]) => {
    if (isValid) beginDownload(prepared);
});
```

---

## 🎯 Implémentation Recommandée

### Phase 1 (Gain immédiat ~2.7s) :
1. ✅ Cache validation licence (routes.py)
2. ✅ Parallélisation cookies (background.js)
3. ✅ Réduction cookies envoyés (background.js)

### Phase 2 (Gain additionnel ~400ms) :
4. Cache settings (utils.py)
5. Cache FFmpeg check (video_processing.py)
6. Réutilisation fichier cookies (video_processing.py)

### Phase 3 (Optimisations avancées) :
7. WebSocket persistant
8. Compression HTTP
9. Prefetching

---

## 📝 Notes Importantes

- **Cache de licence** : Invalider si changement de clé détecté
- **Cookies parallèles** : Garder try/catch pour chaque domaine
- **Settings cache** : Invalider lors de modifications manuelles
- **FFmpeg cache** : Vérifier réellement au démarrage de l'app


