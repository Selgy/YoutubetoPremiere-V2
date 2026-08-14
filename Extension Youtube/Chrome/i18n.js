/**
 * YouTube to Premiere — lightweight i18n
 *
 * English is the default; French is used when the browser UI language is
 * French. Detection order: chrome.i18n.getUILanguage() (set by the browser's
 * own language setting, works in Chrome and Firefox) then navigator.language.
 *
 * Loaded before content.js and popup.js, and exposes window.YTPI18n.
 * Content scripts run in an isolated world, so this does not leak into the page.
 */
(function () {
    'use strict';

    const MESSAGES = {
        en: {
            // --- floating panel ---
            btnVideo: 'Video',
            btnClip: 'Clip',
            btnAudio: 'Audio',
            toggleHide: 'Hide buttons',
            toggleShow: 'Show buttons',
            statusConnected: 'YoutubetoPremiere connected',
            statusNotDetected: 'YoutubetoPremiere not detected',
            eyeTip: '👁️ New! Use the eye button to hide/show the YouTube to Premiere buttons when you don\'t need them.',

            // --- app not running ---
            featurePremiere: 'import this video into Premiere Pro',
            featureClip: 'create a clip from the current timestamp',
            featureAudio: 'extract the audio from this video',
            featureGeneric: 'use this feature',
            serverRequired: 'To {feature}, the YoutubetoPremiere application must be installed and running.',
            ensureRunning: 'Please make sure YoutubetoPremiere is running.',
            connectionFailed: 'Could not connect to YoutubetoPremiere. Make sure Adobe Premiere Pro is open and YoutubetoPremiere is running.',
            reconnectFailed: 'Could not reconnect to YoutubetoPremiere. Please refresh the page.',
            extensionReloaded: 'Extension reloaded. Refresh the page to continue.',

            // --- sign-in ---
            loginPrompt: 'To download age-restricted videos, please sign in to your YouTube account in this tab, then refresh the page.',
            loginButton: 'Sign in to YouTube',
            pleaseSignIn: 'Warning: please sign in to YouTube to download videos.',
            notSignedIn: 'Not signed in to YouTube. Downloads may fail.',
            authIncomplete: 'Warning: YouTube authentication is incomplete. Downloads may fail for private or age-restricted videos.',
            authIncompleteReconnect: 'YouTube authentication is incomplete. Please sign in again.',
            authCheckFailed: 'Could not verify authentication. Attempting download anyway...',

            // --- download lifecycle ---
            downloadCancelled: 'Download cancelled',
            cooldown: 'Please wait a few seconds after cancelling before starting again.',
            alreadyDownloading: 'A {type} download is already in progress. Please wait.',
            connectionUnstable: 'Unstable connection during download. Reconnecting...',
            connectionLost: 'Connection lost during download. Please refresh the page.',
            timeout: 'The download timed out. Please try again.',

            // --- errors ---
            errorUnknownDownload: 'Unknown download error',
            errorDownload: 'Download error',
            errorProcessing: 'Processing error',
            processingFailed: 'Video processing failed',
            videoIdFailed: 'Could not detect the YouTube video ID.',
            updateHint: '\n\n💡 An extension update may fix this issue.\nOpen the extension settings to check.',
            error403: 'YouTube authentication error (403). Please sign in to YouTube again and retry.',
            tip403: 'Tip: refresh the YouTube page and make sure you are signed in.',
            errorAgeRestricted: 'This video is age-restricted. Please sign in to YouTube.',
            errorPrivate: 'This video is private or members-only.',
            errorGeo: 'This video is not available in your region.',
            errorUnavailable: 'This video is no longer available.',
            streamingErrors: 'Streaming errors detected. Refreshing the page may help.',
            licenseInvalid: 'Invalid or missing license key. Please enter a valid license key in the settings.',
            licenseExpired: 'Invalid or expired license. Please check your license key.',

            // --- popup ---
            popupSubtitle: 'Extension settings',
            popupTitle: 'YouTube to Premiere - Settings',
            updateAvailable: 'Update available',
            updateAvailableDesc: 'A new version of the extension was detected',
            checkingApp: 'Checking application...',
            appConnected: 'Application connected and ready',
            appNotDetectedClick: 'Application not detected - Click to download',
            appNotDetected: 'Application not detected',
            panelVisibility: 'Panel visibility',
            panelVisibilityDesc: 'Show or hide the floating panel',
            pinMode: 'Pin mode',
            pinModeDesc: 'Pin the panel to the page (follows scrolling) or leave it floating (fixed in the window)',
            buttonSize: 'Button size',
            buttonSizeDesc: 'Adjust the button size to the space available',
            sizeNormal: 'Normal',
            sizeCompact: 'Compact',
            sizeMini: 'Mini',
            sizeMicro: 'Micro',
            panelPosition: 'Panel position',
            panelPositionDesc: 'You can also move the panel by dragging it',
            resetBtn: 'Reset',
            centerBtn: 'Center',
            autoHide: 'Auto-hide',
            autoHideDesc: 'Hide automatically in fullscreen',
            resetAll: 'Reset all settings',
            positionReset: 'Position reset',
            positionCentered: 'Position centered',
            positionUpdated: 'Position updated',
            settingsReset: 'All settings have been reset',
            confirmResetAll: 'Do you really want to reset all settings?'
        },

        fr: {
            // --- panneau flottant ---
            btnVideo: 'Vidéo',
            btnClip: 'Clip',
            btnAudio: 'Audio',
            toggleHide: 'Masquer les boutons',
            toggleShow: 'Afficher les boutons',
            statusConnected: 'YoutubetoPremiere connecté',
            statusNotDetected: 'YoutubetoPremiere non détecté',
            eyeTip: '👁️ Nouveau ! Utilisez le bouton œil pour masquer/afficher les boutons YouTube to Premiere quand vous n\'en avez pas besoin.',

            // --- application non démarrée ---
            featurePremiere: 'importer cette vidéo vers Premiere Pro',
            featureClip: 'créer un clip à partir du timestamp actuel',
            featureAudio: 'extraire l\'audio de cette vidéo',
            featureGeneric: 'utiliser cette fonctionnalité',
            serverRequired: 'Pour {feature}, l\'application YoutubetoPremiere doit être installée et démarrée.',
            ensureRunning: 'Veuillez vous assurer que YoutubetoPremiere fonctionne.',
            connectionFailed: 'Connexion à YoutubetoPremiere échouée. Assurez-vous qu\'Adobe Premiere Pro est ouvert et que YoutubetoPremiere fonctionne.',
            reconnectFailed: 'Impossible de se reconnecter à YoutubetoPremiere. Veuillez rafraîchir la page.',
            extensionReloaded: 'Extension rechargée. Rafraîchissez la page pour continuer.',

            // --- connexion ---
            loginPrompt: 'Pour télécharger des vidéos avec restrictions d\'âge, veuillez vous connecter à votre compte YouTube dans cet onglet, puis rafraîchir la page.',
            loginButton: 'Se connecter à YouTube',
            pleaseSignIn: 'Attention: Veuillez vous connecter à YouTube pour télécharger des vidéos.',
            notSignedIn: 'Non connecté à YouTube. Les téléchargements peuvent échouer.',
            authIncomplete: 'Attention: Authentification YouTube incomplète. Le téléchargement peut échouer pour certaines vidéos privées ou avec restrictions d\'âge.',
            authIncompleteReconnect: 'Authentification YouTube incomplète. Veuillez vous reconnecter.',
            authCheckFailed: 'Impossible de vérifier l\'authentification. Tentative de téléchargement...',

            // --- cycle de téléchargement ---
            downloadCancelled: 'Téléchargement annulé',
            cooldown: 'Veuillez patienter quelques secondes après l\'annulation avant de relancer.',
            alreadyDownloading: 'Un téléchargement {type} est déjà en cours. Veuillez patienter.',
            connectionUnstable: 'Connexion instable pendant le téléchargement. Tentative de reconnexion...',
            connectionLost: 'Connexion perdue pendant le téléchargement. Rafraîchissez la page.',
            timeout: 'Délai d\'attente dépassé pour le téléchargement. Veuillez réessayer.',

            // --- erreurs ---
            errorUnknownDownload: 'Erreur de téléchargement inconnue',
            errorDownload: 'Erreur de téléchargement',
            errorProcessing: 'Erreur de traitement',
            processingFailed: 'Échec du traitement de la vidéo',
            videoIdFailed: 'Impossible de détecter l\'ID de la vidéo YouTube.',
            updateHint: '\n\n💡 Une mise à jour de l\'extension pourrait résoudre ce problème.\nOuvrez les paramètres de l\'extension pour vérifier.',
            error403: 'Erreur d\'authentification YouTube (403). Veuillez vous reconnecter à YouTube et réessayer.',
            tip403: 'Conseil: Rafraîchissez la page YouTube et assurez-vous d\'être connecté.',
            errorAgeRestricted: 'Cette vidéo est soumise à une restriction d\'âge. Veuillez vous connecter à YouTube.',
            errorPrivate: 'Cette vidéo est privée ou réservée aux membres.',
            errorGeo: 'Cette vidéo n\'est pas disponible dans votre région.',
            errorUnavailable: 'Cette vidéo n\'est plus disponible.',
            streamingErrors: 'Erreurs de streaming détectées. Rafraîchir la page pourrait aider.',
            licenseInvalid: 'Clé de licence invalide ou manquante. Veuillez entrer une clé de licence valide dans les paramètres.',
            licenseExpired: 'Licence invalide ou expirée. Veuillez vérifier votre clé de licence.',

            // --- popup ---
            popupSubtitle: 'Paramètres de l\'extension',
            popupTitle: 'YouTube to Premiere - Paramètres',
            updateAvailable: 'Mise à jour disponible',
            updateAvailableDesc: 'Nouvelle version de l\'extension détectée',
            checkingApp: 'Vérification de l\'application...',
            appConnected: 'Application connectée et prête',
            appNotDetectedClick: 'Application non détectée - Cliquer pour télécharger',
            appNotDetected: 'Application non détectée',
            panelVisibility: 'Affichage du panneau',
            panelVisibilityDesc: 'Activer/désactiver l\'affichage du panneau flottant',
            pinMode: 'Mode épinglage',
            pinModeDesc: 'Épingler le panneau à la page (suit le scroll) ou le laisser flottant (fixe dans la fenêtre)',
            buttonSize: 'Taille des boutons',
            buttonSizeDesc: 'Ajuste la taille des boutons selon l\'espace disponible',
            sizeNormal: 'Normal',
            sizeCompact: 'Compact',
            sizeMini: 'Mini',
            sizeMicro: 'Micro',
            panelPosition: 'Position du panneau',
            panelPositionDesc: 'Vous pouvez aussi déplacer le panneau en le faisant glisser',
            resetBtn: 'Réinitialiser',
            centerBtn: 'Centrer',
            autoHide: 'Masquage automatique',
            autoHideDesc: 'Masquer automatiquement en plein écran',
            resetAll: 'Réinitialiser tous les paramètres',
            positionReset: 'Position réinitialisée',
            positionCentered: 'Position centrée',
            positionUpdated: 'Position mise à jour',
            settingsReset: 'Tous les paramètres ont été réinitialisés',
            confirmResetAll: 'Voulez-vous vraiment réinitialiser tous les paramètres ?'
        }
    };

    function detectLanguage() {
        let lang = '';
        try {
            const api = (typeof chrome !== 'undefined' && chrome.i18n) ? chrome.i18n
                      : (typeof browser !== 'undefined' && browser.i18n) ? browser.i18n
                      : null;
            if (api && typeof api.getUILanguage === 'function') {
                lang = api.getUILanguage();
            }
        } catch (e) {
            // getUILanguage can throw if the extension context was invalidated
        }
        if (!lang && typeof navigator !== 'undefined') {
            lang = navigator.language || navigator.userLanguage || '';
        }
        // Everything that is not French falls back to English.
        return String(lang).toLowerCase().indexOf('fr') === 0 ? 'fr' : 'en';
    }

    const LANG = detectLanguage();

    /**
     * Translate a key. Unknown keys fall back to English, then to the key
     * itself, so a missing translation degrades instead of showing "undefined".
     * Placeholders are written {name} and filled from `params`.
     */
    function t(key, params) {
        const table = MESSAGES[LANG] || MESSAGES.en;
        let text = (table && table[key] !== undefined) ? table[key] : MESSAGES.en[key];
        if (text === undefined) {
            return key;
        }
        if (params) {
            Object.keys(params).forEach(function (name) {
                text = text.split('{' + name + '}').join(params[name]);
            });
        }
        return text;
    }

    /** Fill [data-i18n] (text) and [data-i18n-title] (tooltip) elements. */
    function applyI18n(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach(function (el) {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
    }

    window.YTPI18n = { t: t, applyI18n: applyI18n, lang: LANG };
})();
