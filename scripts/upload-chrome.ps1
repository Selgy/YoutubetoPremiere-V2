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

# Vérifier que les versions sont synchronisées
Write-ColorOutput "[CHECK] Verification de la synchronisation des versions..." $Cyan
$packageVersion = (Get-Content "package.json" | ConvertFrom-Json).version
$manifestPath = "extensions\Chrome\manifest.json"

if (Test-Path $manifestPath) {
    $manifestVersion = (Get-Content $manifestPath | ConvertFrom-Json).version
    
    if ($packageVersion -ne $manifestVersion) {
        Write-ColorOutput "[ERREUR] Versions desynchronisees !" $Red
        Write-ColorOutput "  package.json:          $packageVersion" $Yellow
        Write-ColorOutput "  manifest.json Chrome:  $manifestVersion" $Yellow
        Write-ColorOutput "" $Red
        Write-ColorOutput "Executez 'npm run sync:version' avant d'uploader" $Yellow
        exit 1
    }
    
    Write-ColorOutput "  [OK] Versions synchronisees: $packageVersion" $Green
} else {
    Write-ColorOutput "[ERREUR] Manifest Chrome introuvable: $manifestPath" $Red
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
$extensionPath = "extensions\Chrome"
$zipFileName = "chrome-extension.zip"
$zipPath = Join-Path $PWD $zipFileName

# Fichiers à exclure du ZIP
$excludePatterns = @(
    "*.md",
    ".DS_Store",
    "Thumbs.db",
    "package-lock.json",
    "node_modules"
)

# Créer le fichier ZIP de l'extension
Write-ColorOutput "[WORK] Creation du package ZIP..." $Cyan

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

try {
    # Créer un dossier temporaire pour préparer le package
    $tempDir = Join-Path $env:TEMP "chrome-extension-temp"
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    # Copier les fichiers en excluant ce qui ne doit pas être dans le package
    Get-ChildItem -Path $extensionPath -Recurse | Where-Object {
        $file = $_
        $shouldInclude = $true
        foreach ($pattern in $excludePatterns) {
            if ($file.Name -like $pattern) {
                $shouldInclude = $false
                break
            }
        }
        $shouldInclude
    } | ForEach-Object {
        $relativePath = $_.FullName.Substring($extensionPath.Length + 1)
        $targetPath = Join-Path $tempDir $relativePath
        $targetDir = Split-Path $targetPath -Parent
        
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        if (-not $_.PSIsContainer) {
            Copy-Item $_.FullName -Destination $targetPath -Force
        }
    }
    
    # Créer le ZIP depuis le dossier temporaire
    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
    
    # Nettoyer le dossier temporaire
    Remove-Item $tempDir -Recurse -Force
    
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

# Vérifier l'état de l'extension et annuler toute review en cours
Write-ColorOutput "[WORK] Verification du statut de l'extension..." $Cyan
try {
    # Utiliser l'API Chrome Web Store pour obtenir le statut
    $statusCommand = "npx chrome-webstore-upload fetch --extension-id `"$extensionId`" --client-id `"$clientId`" --client-secret `"$clientSecret`" --refresh-token `"$refreshToken`""
    $statusResult = Invoke-Expression $statusCommand 2>&1
    
    # Vérifier si l'extension est en review (statut PENDING ou IN_REVIEW)
    if ($statusResult -match "PENDING|IN_REVIEW|ITEM_NOT_UPDATABLE") {
        Write-ColorOutput "  [INFO] Une soumission est deja en cours de review" $Yellow
        Write-ColorOutput "  [WORK] Annulation de la review en cours..." $Cyan
        
        try {
            # Utiliser l'API pour annuler la soumission
            $cancelCommand = "npx chrome-webstore-upload unpublish --extension-id `"$extensionId`" --client-id `"$clientId`" --client-secret `"$clientSecret`" --refresh-token `"$refreshToken`""
            $cancelResult = Invoke-Expression $cancelCommand 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "  [OK] Review precedente annulee avec succes" $Green
                Start-Sleep -Seconds 2  # Attendre que l'API se mette à jour
            } else {
                Write-ColorOutput "  [WARNING] Impossible d'annuler automatiquement la review" $Yellow
                Write-ColorOutput "  [INFO] L'upload va quand meme etre tente..." $Yellow
            }
        } catch {
            Write-ColorOutput "  [WARNING] Erreur lors de l'annulation: $($_.Exception.Message)" $Yellow
            Write-ColorOutput "  [INFO] L'upload va quand meme etre tente..." $Yellow
        }
    } else {
        Write-ColorOutput "  [OK] Aucune review en cours, upload possible" $Green
    }
} catch {
    Write-ColorOutput "  [WARNING] Impossible de verifier le statut: $($_.Exception.Message)" $Yellow
    Write-ColorOutput "  [INFO] L'upload va quand meme etre tente..." $Yellow
}

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