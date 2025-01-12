# Stop on first error
$ErrorActionPreference = "Stop"

function Write-Step {
    param($Message)
    Write-Host "`n==== $Message ====`n" -ForegroundColor Cyan
}

function Test-LastExitCode {
    param($Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed: $Step failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# Clean up previous build
Write-Step "Cleaning previous build"
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}

# Step 1: Build the frontend
Write-Step "Building frontend with yarn"
yarn install
Test-LastExitCode "Yarn install"
yarn build
Test-LastExitCode "Yarn build"

# Step 2: Ensure CEP interface files are copied
Write-Step "Copying CEP interface files"
$cepLibPath = "dist/cep/js/lib/cep"
New-Item -ItemType Directory -Force -Path $cepLibPath | Out-Null

# Copy all necessary CEP files
$cepFiles = @(
    "csinterface.js",
    "vulcan.js",
    "cep_engine_extensions.js"
)

foreach ($file in $cepFiles) {
    $sourcePath = "src/js/lib/cep/$file"
    $destPath = "$cepLibPath/$file"
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination $destPath -Force
        Write-Host "Copied $file" -ForegroundColor Green
    } else {
        Write-Host "Warning: $file not found in source" -ForegroundColor Yellow
    }
}

# Step 3: Build Python executable
Write-Step "Building Python executable"
pyinstaller YoutubetoPremiere.spec --distpath dist/cep/exec --noconfirm
Test-LastExitCode "PyInstaller build"

# Step 4: Copy ffmpeg
Write-Step "Copying ffmpeg"
Copy-Item "app/ffmpeg.exe" -Destination "dist/cep/exec/ffmpeg.exe" -Force
Test-LastExitCode "FFmpeg copy"

Write-Host "`nBuild completed successfully!" -ForegroundColor Green 