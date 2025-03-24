#!/usr/bin/env pwsh
# Script de vérification du contenu du ZXP
# Utiliser: pwsh verify-zxp-contents.ps1 [chemin/vers/le/fichier.zxp]

param (
    [Parameter(Position=0)]
    [string]$ZxpPath = "dist/zxp/YoutubetoPremiere-v3.0.1.zxp"
)

Write-Host "=== VERIFICATION DU CONTENU DU ZXP ==="
Write-Host "Fichier ZXP: $ZxpPath"

if (-not (Test-Path $ZxpPath)) {
    Write-Host "❌ ERREUR: Le fichier ZXP n'existe pas: $ZxpPath" -ForegroundColor Red
    exit 1
}

# Créer un dossier temporaire pour l'extraction
$tempDir = Join-Path $env:TEMP "zxp-verification-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "Dossier d'extraction temporaire: $tempDir"

# Copier le ZXP vers un ZIP pour l'extraction
$zipPath = Join-Path $tempDir "package.zip"
Copy-Item -Path $ZxpPath -Destination $zipPath -Force

# Extraire le contenu
try {
    Write-Host "Extraction du ZXP..."
    Expand-Archive -Path $zipPath -DestinationPath "$tempDir/contents" -Force
    Write-Host "✅ Extraction réussie" -ForegroundColor Green
} catch {
    Write-Host "❌ ERREUR d'extraction: $_" -ForegroundColor Red
    exit 1
}

# Vérifier la présence des fichiers exécutables essentiels
$requiredFiles = @(
    "exec/YoutubetoPremiere.exe",   # Exécutable Windows
    "exec/YoutubetoPremiere",       # Exécutable macOS
    "exec/ffmpeg.exe",              # FFmpeg Windows
    "exec/ffmpeg",                  # FFmpeg macOS
    "exec/fix-permissions.sh"       # Script de correction des permissions macOS
)

$allFilesPresent = $true
$fileDetails = @()

foreach ($file in $requiredFiles) {
    $filePath = Join-Path "$tempDir/contents" $file
    $exists = Test-Path $filePath
    $fileInfo = @{
        Name = $file
        Exists = $exists
        Size = if ($exists) { (Get-Item $filePath).Length } else { 0 }
    }
    $fileDetails += $fileInfo
    
    if ($exists) {
        Write-Host "✅ $file trouvé (Taille: $($fileInfo.Size) octets)" -ForegroundColor Green
    } else {
        Write-Host "❌ $file MANQUANT" -ForegroundColor Red
        $allFilesPresent = $false
    }
}

# Vérifier les fichiers Python essentiels
$pythonFiles = @(
    "exec/YoutubetoPremiere.py",
    "exec/init.py",
    "exec/routes.py",
    "exec/utils.py",
    "exec/video_processing.py"
)

foreach ($file in $pythonFiles) {
    $filePath = Join-Path "$tempDir/contents" $file
    $exists = Test-Path $filePath
    $fileInfo = @{
        Name = $file
        Exists = $exists
        Size = if ($exists) { (Get-Item $filePath).Length } else { 0 }
    }
    $fileDetails += $fileInfo
    
    if ($exists) {
        Write-Host "✅ $file trouvé (Taille: $($fileInfo.Size) octets)" -ForegroundColor Green
    } else {
        Write-Host "❌ $file MANQUANT" -ForegroundColor Yellow
    }
}

# Afficher le résumé de la vérification
Write-Host "`n=== RÉSUMÉ DE LA VÉRIFICATION ==="
if ($allFilesPresent) {
    Write-Host "✅ SUCCÈS: Tous les exécutables essentiels sont présents dans le ZXP!" -ForegroundColor Green
} else {
    Write-Host "❌ ÉCHEC: Certains exécutables essentiels manquent dans le ZXP!" -ForegroundColor Red
}

# Obtenir la taille totale des fichiers dans le ZXP
$zxpSize = (Get-Item $ZxpPath).Length
$totalExtractedSize = (Get-ChildItem "$tempDir/contents" -Recurse | Measure-Object -Property Length -Sum).Sum

Write-Host "`nTaille du ZXP: $([math]::Round($zxpSize/1MB, 2)) MB"
Write-Host "Taille totale extraite: $([math]::Round($totalExtractedSize/1MB, 2)) MB"

# Nettoyer les fichiers temporaires
Write-Host "`nNettoyage des fichiers temporaires..."
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "✅ Nettoyage terminé"

Write-Host "`n=== VÉRIFICATION TERMINÉE ==="

# Retourner un code d'erreur si des fichiers sont manquants
if (-not $allFilesPresent) {
    exit 1
} else {
    exit 0
} 