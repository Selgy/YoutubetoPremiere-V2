#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const platform = process.platform;
const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');

function log(message) {
  console.log(`[BUILD] ${message}`);
}

function run(command, options = {}) {
  if (isVerbose) {
    log(`Executing: ${command}`);
  }
  try {
    const result = execSync(command, { 
      stdio: isVerbose ? 'inherit' : 'pipe', 
      encoding: 'utf8',
      ...options 
    });
    return result;
  } catch (error) {
    console.error(`Error executing: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

function checkPrerequisites() {
  log('Checking prerequisites...');
  
  // Check Python venv
  const venvPath = platform === 'win32' ? 'venv\\Scripts\\python.exe' : 'venv/bin/python';
  if (!fs.existsSync(venvPath)) {
    throw new Error('Python virtual environment not found. Run: python -m venv venv');
  }
  
  // Check Node modules
  if (!fs.existsSync('node_modules')) {
    log('Installing Node.js dependencies...');
    run('yarn install');
  }
  
  log('✅ Prerequisites OK');
}

function buildFrontend() {
  log('Building frontend...');
  // Vite handles TypeScript compilation internally
  run('npx vite build');
  log('✅ Frontend built');
}

function buildPython() {
  log('Building Python backend...');
  run('node build-python.js');
  log('✅ Python backend built');
}

function main() {
  log(`Building for ${platform}`);
  
  try {
    checkPrerequisites();
    buildFrontend();
    buildPython();
    
    log('🎉 Build completed successfully!');
    log('Extension available in: dist/cep/');
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 