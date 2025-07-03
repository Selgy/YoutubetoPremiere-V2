#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

console.log('Starting Python build process...');

// Function to create directory if it doesn't exist
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.log(`Creating directory: ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// Create necessary directories for CEP
const directories = [
    'dist/cep/exec',
    'dist/cep/js',
    'dist/cep/jsx',
    'dist/cep/exec/sounds',
    'dist/zxp/cep/exec',
    'dist/zxp/cep/js',
    'dist/zxp/cep/jsx',
    'dist/zxp/cep/exec/sounds',
    'src/exec/sounds',
    'app/sounds'
];

directories.forEach(ensureDir);

// Ensure app/sounds directory exists with placeholder
const gitkeepPath = path.join('app', 'sounds', '.gitkeep');
if (!fs.existsSync(gitkeepPath)) {
    console.log('Creating app/sounds directory with placeholder...');
    fs.writeFileSync(gitkeepPath, '');
}

// Copy static assets
console.log('Copying static assets to CEP extension directory...');

function copyRecursive(src, dest) {
    if (fs.existsSync(src)) {
        console.log(`Copying ${src} to ${dest}...`);
        try {
            fs.cpSync(src, dest, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Warning: Failed to copy ${src} to ${dest}:`, error.message);
        }
    }
}

// Copy src directories
copyRecursive('src/js', 'dist/cep/js');
copyRecursive('src/jsx', 'dist/cep/jsx');

// Copy src/exec files (excluding sounds directory)
if (fs.existsSync('src/exec')) {
    const execFiles = fs.readdirSync('src/exec').filter(file => {
        const filePath = path.join('src/exec', file);
        return fs.statSync(filePath).isFile();
    });
    
    execFiles.forEach(file => {
        const src = path.join('src/exec', file);
        const dest = path.join('dist/cep/exec', file);
        try {
            fs.copyFileSync(src, dest);
        } catch (error) {
            console.warn(`Warning: Failed to copy ${src}:`, error.message);
        }
    });
}

// Detect OS
const isWindows = os.platform() === 'win32';
const isMacOS = os.platform() === 'darwin';

console.log(`Detected OS: ${isWindows ? 'Windows' : isMacOS ? 'macOS' : 'Other'}`);

// Clean up existing PyInstaller output
console.log('Cleaning up existing PyInstaller output...');
function removeIfExists(dirPath) {
    if (fs.existsSync(dirPath)) {
        console.log(`Removing ${dirPath}...`);
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

removeIfExists('dist/YoutubetoPremiere');
removeIfExists('build/YoutubetoPremiere');
ensureDir('dist');
ensureDir('build/YoutubetoPremiere-work');

// Build with PyInstaller
console.log('Building with PyInstaller...');

// Check if sounds directory has actual files (excluding .gitkeep)
function hasSoundFiles() {
    if (!fs.existsSync('app/sounds')) return false;
    const files = fs.readdirSync('app/sounds').filter(f => f !== '.gitkeep');
    return files.length > 0;
}

// Build PyInstaller command
let pyinstallerCmd = [
    'pyinstaller',
    '--name YoutubetoPremiere',
    '--onedir',
    '-y',
    '--clean',
    '--distpath ./dist',
    '--workpath ./build/YoutubetoPremiere-work'
];

// Add sounds data if they exist
if (hasSoundFiles()) {
    if (isWindows) {
        pyinstallerCmd.push('--add-data', 'app/sounds;exec/sounds');
    } else {
        pyinstallerCmd.push('--add-data', 'app/sounds:exec/sounds');
    }
}

// Add Python files
if (isWindows) {
    pyinstallerCmd.push('--add-data', 'app/*.py;.');
} else {
    pyinstallerCmd.push('--add-data', 'app/*.py:.');
}

// Add hidden imports
const hiddenImports = [
    'engineio.async_drivers.threading',
    'flask_socketio',
    'flask_cors',
    'werkzeug',
    'yt_dlp',
    'psutil',
    'requests',
    'tqdm',
    'pygame',
    'curl_cffi',
    'python_dotenv',
    'eventlet',
    'gevent_websocket',
    'simple_websocket',
    'video_processing',
    'utils',
    'init',
    'routes'
];

hiddenImports.forEach(imp => {
    pyinstallerCmd.push('--hidden-import', imp);
});

// Add collect-all
const collectAll = [
    'yt_dlp',
    'flask',
    'flask_socketio',
    'flask_cors',
    'werkzeug',
    'psutil',
    'requests',
    'tqdm',
    'pygame',
    'curl_cffi',
    'python_dotenv',
    'eventlet',
    'gevent_websocket',
    'simple_websocket'
];

collectAll.forEach(pkg => {
    pyinstallerCmd.push('--collect-all', pkg);
});

// Add main script
pyinstallerCmd.push('app/YoutubetoPremiere.py');

// Execute PyInstaller
console.log('Executing:', pyinstallerCmd.join(' '));
try {
    execSync(pyinstallerCmd.join(' '), { 
        stdio: 'inherit',
        cwd: process.cwd()
    });
} catch (error) {
    console.error('PyInstaller failed:', error.message);
    process.exit(1);
}

// Copy the build output to the CEP directory
const executablePaths = [
    'dist/YoutubetoPremiere/YoutubetoPremiere',
    'dist/YoutubetoPremiere/YoutubetoPremiere.exe',
    'dist/YoutubetoPremiere.exe'
];

let executableCopied = false;
for (const exePath of executablePaths) {
    if (fs.existsSync(exePath)) {
        console.log(`Copying built executable from ${exePath} to dist/cep/exec`);
        const fileName = path.basename(exePath);
        fs.copyFileSync(exePath, path.join('dist/cep/exec', fileName));
        executableCopied = true;
        break;
    }
}

if (!executableCopied) {
    console.warn('Warning: YoutubetoPremiere executable not found. Searching for it...');
    // Try to find the executable recursively
    function findExecutable(dir) {
        if (!fs.existsSync(dir)) return null;
        
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const found = findExecutable(fullPath);
                if (found) return found;
            } else if (item === 'YoutubetoPremiere' || item === 'YoutubetoPremiere.exe') {
                return fullPath;
            }
        }
        return null;
    }
    
    const foundExe = findExecutable('dist');
    if (foundExe) {
        console.log(`Found executable at: ${foundExe}`);
        const fileName = path.basename(foundExe);
        fs.copyFileSync(foundExe, path.join('dist/cep/exec', fileName));
        executableCopied = true;
    }
}

if (!executableCopied) {
    console.error('Error: Could not find YoutubetoPremiere executable after build');
    process.exit(1);
}

// Copy the entire YoutubetoPremiere folder contents to exec
const pyinstallerOutput = 'dist/YoutubetoPremiere';
if (fs.existsSync(pyinstallerOutput)) {
    console.log('Copying PyInstaller output directory contents to dist/cep/exec...');
    copyRecursive(pyinstallerOutput, 'dist/cep/exec');
}

// Copy FFmpeg if it exists
const ffmpegPaths = ['app/ffmpeg.exe', 'ffmpeg.exe', 'ffmpeg'];
for (const ffmpegPath of ffmpegPaths) {
    if (fs.existsSync(ffmpegPath)) {
        console.log(`Copying FFmpeg from ${ffmpegPath} to dist/cep/exec/`);
        const fileName = path.basename(ffmpegPath);
        fs.copyFileSync(ffmpegPath, path.join('dist/cep/exec', fileName));
        break;
    }
}

// Copy to ZXP directory as well
console.log('Copying to ZXP directory...');
copyRecursive('dist/cep', 'dist/zxp/cep');

console.log('Python build completed successfully!'); 