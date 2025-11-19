# 🔒 Explication des Permissions de l'Extension

## Pourquoi l'extension demande l'accès au réseau local ?

L'extension **YouTube to Premiere Pro** doit communiquer avec l'application installée sur votre ordinateur pour fonctionner.

### 🏠 Architecture de l'Application

```
┌─────────────────┐      WebSocket/HTTP      ┌──────────────────────┐
│  Extension      │ ←→  localhost:17845  ←→  │  Application Python  │
│  Chrome         │                           │  (YoutubetoPremiere) │
└─────────────────┘                           └──────────────────────┘
                                                        ↓
                                              ┌──────────────────────┐
                                              │  Adobe Premiere Pro  │
                                              └──────────────────────┘
```

### 📋 Permissions Demandées

| Permission | Utilisation | Pourquoi ? |
|-----------|-------------|-----------|
| **`http://localhost/*`** | Communication locale | Pour envoyer les vidéos à l'application Premiere Pro |
| `activeTab` | Lecture page YouTube | Pour détecter la vidéo en cours de visionnage |
| `storage` | Sauvegarde paramètres | Pour mémoriser vos préférences (position panneau, etc.) |
| `cookies` | Accès YouTube | Pour télécharger les vidéos authentifiées |
| `https://www.youtube.com/*` | Accès contenu YouTube | Pour extraire les informations des vidéos |

### 🔐 Sécurité et Confidentialité

**✅ Aucune donnée n'est envoyée sur Internet**
- Toutes les communications se font entre l'extension et votre application locale
- `localhost:17845` signifie que rien ne sort de votre ordinateur

**✅ Open Source**
- Le code source est disponible publiquement sur GitHub
- Vous pouvez vérifier exactement ce que fait l'extension

**✅ Pas de télémétrie**
- Aucun tracking
- Aucune collecte de données
- Aucun service tiers

### 🛠️ Détails Techniques

**Port utilisé :** `17845`
**Protocoles :** WebSocket + HTTP
**Endpoints locaux :**
- `http://localhost:17845/health` - Vérification connexion
- `http://localhost:17845/send-url` - Envoi URL vidéo
- `http://localhost:17845/check-license` - Vérification licence
- WebSocket sur `ws://localhost:17845` - Communication temps réel

### ❓ Questions Fréquentes

**Q: L'extension peut-elle accéder à d'autres sites web ?**
Non, uniquement YouTube et localhost.

**Q: Mes données sont-elles envoyées quelque part ?**
Non, tout reste sur votre machine. L'extension communique uniquement avec l'application locale.

**Q: Est-ce sûr d'autoriser l'accès au réseau local ?**
Oui, car :
1. L'accès est limité à localhost uniquement
2. Le code est open source et vérifiable
3. Aucune connexion externe n'est établie

**Q: Puis-je refuser cette permission ?**
Si vous refusez, l'extension ne pourra pas communiquer avec Premiere Pro et ne fonctionnera pas.

### 📞 Support

Si vous avez des questions de sécurité, n'hésitez pas à :
- Consulter le code source : https://github.com/Selgy/YoutubetoPremiere-V2
- Ouvrir une issue sur GitHub
- Vérifier les audits de sécurité

---

**🔒 Votre sécurité est notre priorité !**

