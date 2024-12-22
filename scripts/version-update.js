const fs = require('fs');
const path = require('path');

// Get package.json version
const packageJson = require('../package.json');
const version = packageJson.version;

// Files to update
const files = [
  {
    path: 'package.json',
    regex: /"version": "[^"]+"/,
    template: (version) => `"version": "${version}"`,
  },
  {
    path: 'dist/cep/CSXS/manifest.xml',
    regex: /ExtensionBundleVersion="[^"]+"/g,
    template: (version) => `ExtensionBundleVersion="${version}"`,
  },
  {
    path: 'ChromeExtension/manifest.json',
    regex: /"version": "[^"]+"/,
    template: (version) => `"version": "${version}"`,
  }
];

// Update version in all files
files.forEach(file => {
  const filePath = path.join(process.cwd(), file.path);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(file.regex, file.template(version));
    fs.writeFileSync(filePath, content);
    console.log(`Updated version in ${file.path} to ${version}`);
  }
}); 