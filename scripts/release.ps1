# =====================================================================
# Script de Release Automatisé - YouTube to Premiere Pro (Windows)
# =====================================================================
# Utilisation: .\scripts\release.ps1 3.0.15

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

# Valider le format de version
if (-not ($Version -match "^\d+\.\d+\.\d+$")) {
    Write-Host "[ERREUR] Format de version invalide. Utilisez x.y.z" -ForegroundColor Red
    exit 1
}

Write-Host "[DEBUT] Release v$Version en cours..." -ForegroundColor Cyan

# Vérifications
if (-not (Test-Path "package.json")) {
    Write-Host "[ERREUR] Executez depuis la racine du projet" -ForegroundColor Red
    exit 1
}

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "[ERREUR] Repository non propre. Commitez d'abord." -ForegroundColor Red
    exit 1
}

$currentBranch = git branch --show-current
Write-Host "[INFO] Branche: $currentBranch" -ForegroundColor Yellow

# Mise à jour des versions
Write-Host "[WORK] Mise a jour des versions..." -ForegroundColor Cyan

# package.json
if (Test-Path "package.json") {
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    $pkg.version = $Version
    $pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"
    Write-Host "  [OK] package.json" -ForegroundColor Green
}

# Chrome Extension manifest
if (Test-Path "ChromeExtension/manifest.json") {
    $manifest = Get-Content "ChromeExtension/manifest.json" | ConvertFrom-Json
    $manifest.version = $Version
    $manifest | ConvertTo-Json -Depth 10 | Set-Content "ChromeExtension/manifest.json"
    Write-Host "  [OK] Chrome manifest" -ForegroundColor Green
}

# Background.js
if (Test-Path "ChromeExtension/background.js") {
    $content = Get-Content "ChromeExtension/background.js" -Raw
    $content = $content -replace "Version \d+\.\d+\.\d+", "Version $Version"
    Set-Content "ChromeExtension/background.js" $content
    Write-Host "  [OK] background.js" -ForegroundColor Green
}

# Content.js
if (Test-Path "ChromeExtension/content.js") {
    $content = Get-Content "ChromeExtension/content.js" -Raw
    $content = $content -replace "Version \d+\.\d+\.\d+", "Version $Version"
    Set-Content "ChromeExtension/content.js" $content
    Write-Host "  [OK] content.js" -ForegroundColor Green
}

# main.tsx
if (Test-Path "src/js/main/main.tsx") {
    $content = Get-Content "src/js/main/main.tsx" -Raw
    $content = $content -replace "const currentVersion = '[^']*'", "const currentVersion = '$Version'"
    Set-Content "src/js/main/main.tsx" $content
    Write-Host "  [OK] main.tsx" -ForegroundColor Green
}

# app/routes.py
if (Test-Path "app/routes.py") {
    $content = Get-Content "app/routes.py" -Raw
    $content = $content -replace "return jsonify\(version='[^']*'\)", "return jsonify(version='$Version')"
    $content = $content -replace "current_version = '[^']*'", "current_version = '$Version'"
    Set-Content "app/routes.py" $content
    Write-Host "  [OK] app/routes.py" -ForegroundColor Green
}

# vite.config.ts
if (Test-Path "vite.config.ts") {
    $content = Get-Content "vite.config.ts" -Raw
    $content = $content -replace "const currentVersion = process\.env\.APP_VERSION \|\| '[^']*'", "const currentVersion = process.env.APP_VERSION || '$Version'"
    Set-Content "vite.config.ts" $content
    Write-Host "  [OK] vite.config.ts" -ForegroundColor Green
}

# Script version-update.js
if (Test-Path "tools/version-update.js") {
    node tools/version-update.js $Version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] version-update.js" -ForegroundColor Green
    }
}

# Commit des changements
Write-Host "[WORK] Commit des changements..." -ForegroundColor Cyan
git add .
git commit -m "chore: bump version to $Version"
Write-Host "  [OK] Changements commitees" -ForegroundColor Green

# Vérification du tag
$existingTag = git tag -l "v$Version"
if ($existingTag) {
    Write-Host "[ERREUR] Tag v$Version existe deja" -ForegroundColor Red
    exit 1
}

# Création du tag
Write-Host "[WORK] Creation du tag v$Version..." -ForegroundColor Cyan
git tag -a "v$Version" -m "Release v$Version"
Write-Host "  [OK] Tag cree" -ForegroundColor Green

# Push
Write-Host "[WORK] Push vers GitHub..." -ForegroundColor Cyan
git push origin $currentBranch
git push origin "v$Version"
Write-Host "  [OK] Push termine" -ForegroundColor Green

# Résumé
Write-Host ""
Write-Host "[SUCCESS] RELEASE v$Version TERMINEE !" -ForegroundColor Green
Write-Host ""
Write-Host "[INFO] Resume:" -ForegroundColor Cyan
Write-Host "  - Version: $Version" -ForegroundColor White
Write-Host "  - Branche: $currentBranch" -ForegroundColor White
Write-Host "  - Tag: v$Version" -ForegroundColor White
Write-Host ""
Write-Host "[INFO] GitHub Actions: https://github.com/Selgy/YoutubetoPremiere-V2/actions" -ForegroundColor Cyan
Write-Host ""
Write-Host "[INFO] Artefacts attendus:" -ForegroundColor Cyan
Write-Host "  - YoutubetoPremiere_Mac_arm64_$Version.pkg" -ForegroundColor White
Write-Host "  - YoutubetoPremiere_Win_$Version.exe" -ForegroundColor White
Write-Host ""
Write-Host "[INFO] Build: environ 15-30 minutes" -ForegroundColor Yellow

# Ouverture GitHub Actions
$response = Read-Host "Ouvrir GitHub Actions ? (y/N)"
if ($response -eq "y" -or $response -eq "Y") {
    Start-Process "https://github.com/Selgy/YoutubetoPremiere-V2/actions"
}

Write-Host "[OK] Script termine !" -ForegroundColor Green 