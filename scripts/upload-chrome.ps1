# =====================================================================
# Script d'Upload Chrome Web Store - YouTube to Premiere Pro
# =====================================================================
# Ce script automatise l'upload de l'extension Chrome vers le Chrome Web Store
# 
# Usage: .\scripts\upload-chrome.ps1 [-action upload|publish]
# 
# Prérequis:
# 1. Avoir configuré les variables d'environnement:
#    - CHROME_EXTENSION_ID
#    - CHROME_CLIENT_ID  
#    - CHROME_CLIENT_SECRET
#    - CHROME_REFRESH_TOKEN
# 2. Avoir une version zipée de l'extension
# =====================================================================

param(
    [Parameter()]
    [ValidateSet("upload", "publish")]
    [string]$Action = "upload"
)

# Couleurs pour l'affichage
$Red = [ConsoleColor]::Red
$Green = [ConsoleColor]::Green
$Yellow = [ConsoleColor]::Yellow
$Cyan = [ConsoleColor]::Cyan

function Write-ColorOutput {
    param([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::White)
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "[DEBUT] Upload Chrome Extension en cours..." $Cyan

# Vérifier qu'on est dans la racine du projet
if (-not (Test-Path "package.json")) {
    Write-ColorOutput "[ERREUR] Executez depuis la racine du projet" $Red
    exit 1
}

# Vérifier les variables d'environnement
$requiredVars = @(
    "CHROME_EXTENSION_ID",
    "CHROME_CLIENT_ID", 
    "CHROME_CLIENT_SECRET",
    "CHROME_REFRESH_TOKEN"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    if (-not [Environment]::GetEnvironmentVariable($var)) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-ColorOutput "[ERREUR] Variables d'environnement manquantes:" $Red
    foreach ($var in $missingVars) {
        Write-ColorOutput "  - $var" $Red
    }
    Write-ColorOutput "" $Red
    Write-ColorOutput "Configurez ces variables avec:" $Yellow
    Write-ColorOutput '  $env:CHROME_EXTENSION_ID = "votre-extension-id"' $Yellow
    Write-ColorOutput '  $env:CHROME_CLIENT_ID = "votre-client-id"' $Yellow
    Write-ColorOutput '  $env:CHROME_CLIENT_SECRET = "votre-client-secret"' $Yellow
    Write-ColorOutput '  $env:CHROME_REFRESH_TOKEN = "votre-refresh-token"' $Yellow
    exit 1
}

# Chemin du dossier extension Chrome
$extensionPath = "Extension Youtube\Chrome"
$zipFileName = "chrome-extension.zip"
$zipPath = Join-Path $PWD $zipFileName

# Créer le fichier ZIP de l'extension
Write-ColorOutput "[WORK] Creation du package ZIP..." $Cyan

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

try {
    # Utiliser PowerShell pour créer le ZIP
    Compress-Archive -Path "$extensionPath\*" -DestinationPath $zipPath -Force
    Write-ColorOutput "  [OK] Package ZIP cree: $zipFileName" $Green
} catch {
    Write-ColorOutput "[ERREUR] Echec de creation du ZIP: $($_.Exception.Message)" $Red
    exit 1
}

# Vérifier que le ZIP existe et n'est pas vide
if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -eq 0) {
    Write-ColorOutput "[ERREUR] Le fichier ZIP est vide ou inexistant" $Red
    exit 1
}

Write-ColorOutput "  [INFO] Taille du package: $([math]::Round((Get-Item $zipPath).Length / 1KB, 2)) KB" $Yellow

# Construire la commande chrome-webstore-upload
$extensionId = [Environment]::GetEnvironmentVariable("CHROME_EXTENSION_ID")
$clientId = [Environment]::GetEnvironmentVariable("CHROME_CLIENT_ID")
$clientSecret = [Environment]::GetEnvironmentVariable("CHROME_CLIENT_SECRET")
$refreshToken = [Environment]::GetEnvironmentVariable("CHROME_REFRESH_TOKEN")

if ($Action -eq "upload") {
    Write-ColorOutput "[WORK] Upload vers Chrome Web Store (draft)..." $Cyan
    $command = "npx chrome-webstore-upload upload --source `"$zipPath`" --extension-id `"$extensionId`" --client-id `"$clientId`" --client-secret `"$clientSecret`" --refresh-token `"$refreshToken`""
} else {
    Write-ColorOutput "[WORK] Upload et publication vers Chrome Web Store..." $Cyan
    $command = "npx chrome-webstore-upload --source `"$zipPath`" --extension-id `"$extensionId`" --client-id `"$clientId`" --client-secret `"$clientSecret`" --refresh-token `"$refreshToken`""
}

Write-ColorOutput "  [INFO] Commande: chrome-webstore-upload $Action" $Yellow

try {
    # Exécuter la commande
    $result = Invoke-Expression $command
    
    if ($LASTEXITCODE -eq 0) {
        if ($Action -eq "upload") {
            Write-ColorOutput "[SUCCESS] Extension uploadee avec succes !" $Green
            Write-ColorOutput "  [INFO] Status: Draft - Publication manuelle requise" $Yellow
            Write-ColorOutput "  [INFO] Console: https://chrome.google.com/webstore/developer/dashboard" $Cyan
        } else {
            Write-ColorOutput "[SUCCESS] Extension publiee avec succes !" $Green
            Write-ColorOutput "  [INFO] La review Google peut prendre quelques heures" $Yellow
        }
    } else {
        Write-ColorOutput "[ERREUR] Echec de l'upload" $Red
        Write-ColorOutput "  [DEBUG] Code de sortie: $LASTEXITCODE" $Red
    }
} catch {
    Write-ColorOutput "[ERREUR] Erreur lors de l'execution: $($_.Exception.Message)" $Red
    exit 1
}

# Nettoyer le fichier ZIP temporaire
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
    Write-ColorOutput "  [CLEAN] Fichier ZIP temporaire supprime" $Green
}

# Résumé
Write-ColorOutput "" $Green
Write-ColorOutput "[INFO] Resume:" $Cyan
Write-ColorOutput "  - Action: $Action" 
Write-ColorOutput "  - Extension ID: $extensionId"
Write-ColorOutput "  - Source: $extensionPath"

if ($Action -eq "upload") {
    Write-ColorOutput "" $Green
    Write-ColorOutput "[NEXT] Prochaines etapes:" $Yellow
    Write-ColorOutput "  1. Verifiez le draft dans la console Chrome Web Store" 
    Write-ColorOutput "  2. Completez les informations si necessaire"
    Write-ColorOutput "  3. Publiez manuellement depuis la console"
    Write-ColorOutput "     https://chrome.google.com/webstore/developer/dashboard" $Cyan
}

Write-ColorOutput "" $Green
Write-ColorOutput "[OK] Script termine !" $Green