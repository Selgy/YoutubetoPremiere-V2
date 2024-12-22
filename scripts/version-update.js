const fs = require('fs');
const path = require('path');

// Files to update
const files = [
  {
    path: 'package.json',
    regex: /"version": "([^"]+)"/,
    template: (version) => `"version": "${version}"`,
  },
  {
    path: 'dist/cep/CSXS/manifest.xml',
    regex: /ExtensionBundleVersion="([^"]+)"/g,
    template: (version) => `ExtensionBundleVersion="${version}"`,
  },
  {
    path: 'ChromeExtension/manifest.json',
    regex: /"version": "([^"]+)"/,
    template: (version) => `"version": "${version}"`,
  }
];

// Read current version from package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const currentVersion = packageJson.version;

// Update version in all files
files.forEach(file => {
  const filePath = path.join(process.cwd(), file.path);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(file.regex, file.template(currentVersion));
    fs.writeFileSync(filePath, content);
    console.log(`Updated version in ${file.path} to ${currentVersion}`);
  }
}); 