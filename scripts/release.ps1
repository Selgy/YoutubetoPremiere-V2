# =====================================================================
# Script de Release Automatisé - YouTube to Premiere Pro (Windows)
# =====================================================================
# 
# Utilisation: .\scripts\release.ps1 3.0.15
# Exemple: .\scripts\release.ps1 3.0.15
# 
# Ce script automatise entièrement le processus de release :
# 1. Met à jour les versions dans tous les fichiers
# 2. Commit les changements
# 3. Crée et pousse le tag
# 4. Déclenche automatiquement le workflow GitHub Actions
# =====================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Couleurs pour PowerShell
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Blue = "Cyan"

# Fonction d'aide
function Show-Usage {
    Write-Host "Usage: .\scripts\release.ps1 <version>" -ForegroundColor $Blue
    Write-Host "Exemple: .\scripts\release.ps1 3.0.15" -ForegroundColor $Yellow
    Write-Host ""
    Write-Host "Ce script automatise entièrement le processus de release :"
    Write-Host "• Met à jour toutes les versions dans les fichiers"
    Write-Host "• Commit les changements"
    Write-Host "• Crée et pousse le tag"
    Write-Host "• Déclenche le workflow GitHub Actions"
    exit 1
}

# Valider le format de version (x.y.z)
if (-not ($Version -match "^\d+\.\d+\.\d+$")) {
    Write-Host "❌ Erreur: Format de version invalide. Utilisez le format x.y.z (ex: 3.0.15)" -ForegroundColor $Red
    exit 1
}

Write-Host "🚀 Démarrage du processus de release pour la version $Version" -ForegroundColor $Blue

# Vérifier qu'on est dans la racine du projet
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur: Exécutez ce script depuis la racine du projet" -ForegroundColor $Red
    exit 1
}

# Vérifier que git est propre
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "❌ Erreur: Le dépôt git contient des changements non commités" -ForegroundColor $Red
    Write-Host "Commitez ou stashez vos changements avant de continuer."
    git status --short
    exit 1
}

# Vérifier qu'on est sur la bonne branche
$currentBranch = git branch --show-current
if ($currentBranch -ne "main" -and $currentBranch -ne "Pre-released") {
    Write-Host "⚠️ Vous êtes sur la branche '$currentBranch'" -ForegroundColor $Yellow
    Write-Host "   Il est recommandé d'être sur 'main' ou 'Pre-released'" -ForegroundColor $Yellow
    $response = Read-Host "Continuer quand même ? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        exit 1
    }
}

Write-Host "📋 Mise à jour des versions dans tous les fichiers..." -ForegroundColor $Blue

# 1. Mettre à jour package.json
Write-Host "  → package.json" -ForegroundColor $Blue
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $packageJson.version = $Version
    $packageJson | ConvertTo-Json -Depth 100 | Set-Content "package.json"
    Write-Host "    ✅ Version mise à jour dans package.json" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ package.json non trouvé" -ForegroundColor $Yellow
}

# 2. Mettre à jour l'extension Chrome
Write-Host "  → ChromeExtension/manifest.json" -ForegroundColor $Blue
if (Test-Path "ChromeExtension/manifest.json") {
    $manifestJson = Get-Content "ChromeExtension/manifest.json" -Raw | ConvertFrom-Json
    $manifestJson.version = $Version
    $manifestJson | ConvertTo-Json -Depth 100 | Set-Content "ChromeExtension/manifest.json"
    Write-Host "    ✅ Version mise à jour dans ChromeExtension/manifest.json" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ ChromeExtension/manifest.json non trouvé" -ForegroundColor $Yellow
}

# 3. Mettre à jour les fichiers de contenu Chrome Extension
Write-Host "  → ChromeExtension/background.js" -ForegroundColor $Blue
if (Test-Path "ChromeExtension/background.js") {
    $content = Get-Content "ChromeExtension/background.js" -Raw
    $content = $content -replace "Version \d+\.\d+\.\d+", "Version $Version"
    Set-Content "ChromeExtension/background.js" -Value $content
    Write-Host "    ✅ Version mise à jour dans background.js" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ ChromeExtension/background.js non trouvé" -ForegroundColor $Yellow
}

Write-Host "  → ChromeExtension/content.js" -ForegroundColor $Blue
if (Test-Path "ChromeExtension/content.js") {
    $content = Get-Content "ChromeExtension/content.js" -Raw
    $content = $content -replace "Version \d+\.\d+\.\d+", "Version $Version"
    Set-Content "ChromeExtension/content.js" -Value $content
    Write-Host "    ✅ Version mise à jour dans content.js" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ ChromeExtension/content.js non trouvé" -ForegroundColor $Yellow
}

# 4. Mettre à jour project.config.js
Write-Host "  → project.config.js" -ForegroundColor $Blue
if (Test-Path "project.config.js") {
    $content = Get-Content "project.config.js" -Raw
    $content = $content -replace "version: '[^']*'", "version: '$Version'"
    $content = $content -replace "version: `"[^`"]*`"", "version: `"$Version`""
    Set-Content "project.config.js" -Value $content
    Write-Host "    ✅ Version mise à jour dans project.config.js" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ project.config.js non trouvé" -ForegroundColor $Yellow
}

# 5. Mettre à jour vite.config.ts si nécessaire
Write-Host "  → vite.config.ts" -ForegroundColor $Blue
if (Test-Path "vite.config.ts") {
    $content = Get-Content "vite.config.ts" -Raw
    $content = $content -replace "const currentVersion = process\.env\.APP_VERSION \|\| '[^']*'", "const currentVersion = process.env.APP_VERSION || '$Version'"
    Set-Content "vite.config.ts" -Value $content
    Write-Host "    ✅ Version mise à jour dans vite.config.ts" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ vite.config.ts non trouvé" -ForegroundColor $Yellow
}

# 6. Utiliser le script existant tools/version-update.js s'il existe
if (Test-Path "tools/version-update.js") {
    Write-Host "  → Exécution de tools/version-update.js" -ForegroundColor $Blue
    try {
        node tools/version-update.js $Version
        Write-Host "    ✅ tools/version-update.js exécuté" -ForegroundColor $Green
    } catch {
        Write-Host "    ⚠️ Erreur lors de l'exécution de version-update.js" -ForegroundColor $Yellow
    }
}

# 7. Mettre à jour app/routes.py
Write-Host "  → app/routes.py" -ForegroundColor $Blue
if (Test-Path "app/routes.py") {
    $content = Get-Content "app/routes.py" -Raw
    $content = $content -replace "return jsonify\(version='[^']*'\)", "return jsonify(version='$Version')"
    $content = $content -replace "current_version = '[^']*'", "current_version = '$Version'"
    Set-Content "app/routes.py" -Value $content
    Write-Host "    ✅ Version mise à jour dans app/routes.py" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ app/routes.py non trouvé" -ForegroundColor $Yellow
}

# 8. Mettre à jour main.tsx
Write-Host "  → src/js/main/main.tsx" -ForegroundColor $Blue
if (Test-Path "src/js/main/main.tsx") {
    $content = Get-Content "src/js/main/main.tsx" -Raw
    $content = $content -replace "const currentVersion = '[^']*'", "const currentVersion = '$Version'"
    Set-Content "src/js/main/main.tsx" -Value $content
    Write-Host "    ✅ Version mise à jour dans main.tsx" -ForegroundColor $Green
} else {
    Write-Host "    ⚠️ src/js/main/main.tsx non trouvé" -ForegroundColor $Yellow
}

Write-Host "✅ Toutes les versions ont été mises à jour vers $Version" -ForegroundColor $Green

# Vérifier qu'il y a des changements à commiter
$gitStatusAfter = git status --porcelain
if (-not $gitStatusAfter) {
    Write-Host "⚠️ Aucun changement détecté. La version était peut-être déjà $Version" -ForegroundColor $Yellow
    $response = Read-Host "Continuer avec la création du tag ? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        exit 1
    }
} else {
    Write-Host "📝 Ajout et commit des changements..." -ForegroundColor $Blue
    
    # Afficher les fichiers modifiés
    Write-Host "Fichiers modifiés :" -ForegroundColor $Blue
    git status --short
    
    # Ajouter tous les changements
    git add .
    
    # Commit avec un message formaté
    $commitMessage = "chore: bump version to $Version

* Updated package.json version
* Updated Chrome extension manifest version
* Updated project configuration files
* Updated content script version references

Release preparation for v$Version"
    
    git commit -m $commitMessage
    Write-Host "✅ Changements commitées" -ForegroundColor $Green
}

# Vérifier si le tag existe déjà
$existingTag = git tag -l | Where-Object { $_ -eq "v$Version" }
if ($existingTag) {
    Write-Host "❌ Erreur: Le tag v$Version existe déjà" -ForegroundColor $Red
    Write-Host "Supprimez-le d'abord avec : git tag -d v$Version"
    Write-Host "Et du remote avec : git push origin :refs/tags/v$Version"
    exit 1
}

Write-Host "🏷️ Création du tag v$Version..." -ForegroundColor $Blue
$tagMessage = "Release version $Version

🚀 YouTube to Premiere Pro v$Version

This release includes:
* Updated application version to $Version
* All extensions and manifests updated
* Ready for distribution via GitHub Actions workflow

Auto-generated release via Windows release script."

git tag -a "v$Version" -m $tagMessage
Write-Host "✅ Tag v$Version créé" -ForegroundColor $Green

Write-Host "📤 Push des changements et du tag..." -ForegroundColor $Blue

# Pousser la branche actuelle
Write-Host "  → Push de la branche $currentBranch" -ForegroundColor $Blue
git push origin $currentBranch

# Pousser le tag
Write-Host "  → Push du tag v$Version" -ForegroundColor $Blue
git push origin "v$Version"

Write-Host "✅ Push terminé" -ForegroundColor $Green

# Information sur le workflow
Write-Host ""
Write-Host "🎉 RELEASE TERMINÉE AVEC SUCCÈS ! 🎉" -ForegroundColor $Green
Write-Host ""
Write-Host "📋 Résumé :" -ForegroundColor $Blue
Write-Host "   • Version mise à jour : $Version" -ForegroundColor $Green
Write-Host "   • Branch: $currentBranch" -ForegroundColor $Green
Write-Host "   • Tag créé : v$Version" -ForegroundColor $Green
Write-Host ""
Write-Host "🔗 Actions :" -ForegroundColor $Blue
Write-Host "   • GitHub Actions sera déclenché automatiquement"
Write-Host "   • Vérifiez le workflow sur : https://github.com/Selgy/YoutubetoPremiere-V2/actions" -ForegroundColor $Blue
Write-Host ""
Write-Host "📦 Artefacts attendus :" -ForegroundColor $Blue
Write-Host "   • YoutubetoPremiere_Mac_arm64_$Version.pkg" -ForegroundColor $Green
Write-Host "   • YoutubetoPremiere_Win_$Version.exe" -ForegroundColor $Green
Write-Host ""
Write-Host "⏳ Le build prend généralement 15-30 minutes..." -ForegroundColor $Yellow

# Proposer d'ouvrir la page GitHub Actions
Write-Host ""
$response = Read-Host "Ouvrir la page GitHub Actions maintenant ? (y/N)"
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process "https://github.com/Selgy/YoutubetoPremiere-V2/actions"
}

Write-Host ""
Write-Host "🎯 Release script terminé !" -ForegroundColor $Green 