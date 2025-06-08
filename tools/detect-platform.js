/**
 * Platform detection script for cross-platform builds
 */

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

console.log('Detecting platform...');

const platform = os.platform();
console.log(`Detected platform: ${platform}`);

// Function to check if a command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Function to check if we have a Python virtual environment
function hasVirtualEnv() {
  return fs.existsSync(path.join(__dirname, '..', 'venv'));
}

// Function to get the appropriate Python build command
function getPythonBuildCommand(platform) {
  if (hasVirtualEnv()) {
    if (platform === 'win32') {
      return 'venv\\Scripts\\activate && python build-python.js';
    } else {
      return 'source venv/bin/activate && python3 -m app.YoutubetoPremiere || chmod +x ./build-python.sh && ./build-python.sh';
    }
  } else {
    if (platform === 'win32') {
      return 'powershell -ExecutionPolicy Bypass -File build-python.ps1';
    } else {
      return 'chmod +x ./build-python.sh && ./build-python.sh';
    }
  }
}

// Function to get the appropriate package manager command
function getPackageManagerCommand() {
  if (commandExists('yarn')) {
    return 'yarn';
  } else if (commandExists('npm')) {
    return 'npm run';
  } else {
    throw new Error('Neither yarn nor npm found. Please install Node.js and npm.');
  }
}

try {
  const packageManager = getPackageManagerCommand();
  console.log(`Using package manager: ${packageManager.split(' ')[0]}`);
  
  if (platform === 'darwin') {
    console.log('Running macOS build...');
    if (packageManager.startsWith('yarn')) {
    execSync('yarn build-mac', { stdio: 'inherit' });
    } else {
      execSync('npm run build-mac', { stdio: 'inherit' });
    }
  } else if (platform === 'win32') {
    console.log('Running Windows build...');
    if (packageManager.startsWith('yarn')) {
    execSync('yarn build', { stdio: 'inherit' });
    } else {
      execSync('npm run build', { stdio: 'inherit' });
    }
  } else {
    console.log('Running default build for unsupported platform...');
    if (packageManager.startsWith('yarn')) {
    execSync('yarn build', { stdio: 'inherit' });
    } else {
      execSync('npm run build', { stdio: 'inherit' });
    }
  }
} catch (error) {
  console.error('Build failed:', error.message);
  console.log('\nTroubleshooting tips:');
  console.log('1. Make sure all dependencies are installed:');
  console.log('   - npm install --legacy-peer-deps');
  console.log('   - python3 -m venv venv (if not already created)');
  console.log('   - source venv/bin/activate && pip install -r requirements.txt');
  console.log('2. Check that Python and Node.js are properly installed');
  process.exit(1);
}

console.log('Cross-platform build completed successfully!'); 