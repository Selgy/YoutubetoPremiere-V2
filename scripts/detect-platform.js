/**
 * Platform detection script for cross-platform builds
 */

const { execSync } = require('child_process');
const os = require('os');

console.log('Detecting platform...');

const platform = os.platform();
console.log(`Detected platform: ${platform}`);

try {
  if (platform === 'darwin') {
    console.log('Running macOS build...');
    execSync('yarn build-mac', { stdio: 'inherit' });
  } else if (platform === 'win32') {
    console.log('Running Windows build...');
    execSync('yarn build', { stdio: 'inherit' });
  } else {
    console.log('Running default build for unsupported platform...');
    execSync('yarn build', { stdio: 'inherit' });
  }
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}

console.log('Cross-platform build completed successfully!'); 