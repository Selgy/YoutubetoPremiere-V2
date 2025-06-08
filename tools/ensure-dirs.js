const fs = require('fs-extra');
const path = require('path');

const dirs = [
  'dist/cep/exec',
  'dist/cep/js',
  'dist/cep/jsx',
  'dist/cep/exec/sounds',
  'dist/zxp/cep/exec',
  'dist/zxp/cep/js',
  'dist/zxp/cep/jsx',
  'dist/zxp/cep/exec/sounds',
  'build/work',
  'build/YoutubetoPremiere',
  'src/exec',
  'src/exec/sounds',
  'app/sounds'
];

// Ensure all directories exist
dirs.forEach(dir => {
  const dirPath = path.resolve(__dirname, '..', dir);
  fs.ensureDirSync(dirPath);
  console.log(`Created directory: ${dirPath}`);
});

// Create placeholder files in empty directories that need to exist
const placeholderDirs = [
  'app/sounds',
  'src/exec/sounds',
  'dist/cep/exec/sounds'
];

placeholderDirs.forEach(dir => {
  const dirPath = path.resolve(__dirname, '..', dir);
  const placeholderPath = path.join(dirPath, '.gitkeep');
  
  // Only create placeholder if directory is empty
  fs.ensureDirSync(dirPath);
  const files = fs.readdirSync(dirPath);
  if (files.length === 0 || (files.length === 1 && files[0] === '.gitkeep')) {
    fs.writeFileSync(placeholderPath, '# This file ensures the directory is not empty\n');
    console.log(`Created placeholder file in ${dirPath}`);
  }
}); 