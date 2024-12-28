const fs = require('fs-extra');
const path = require('path');

const dirs = [
  'dist/cep/exec',
  'dist/cep/js',
  'dist/cep/jsx',
  'dist/zxp/cep/exec',
  'dist/zxp/cep/js',
  'dist/zxp/cep/jsx',
  'build/work',
  'build/YoutubetoPremiere',
  'src/exec'
];

dirs.forEach(dir => {
  const dirPath = path.resolve(__dirname, '..', dir);
  fs.ensureDirSync(dirPath);
  console.log(`Created directory: ${dirPath}`);
}); 