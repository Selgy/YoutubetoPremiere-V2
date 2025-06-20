const fs = require('fs');
const path = require('path');

// Get version from command line argument
const version = process.argv[2];
if (!version) {
  console.error('Version argument is required');
  process.exit(1);
}

// Files to update
const files = [
  {
    path: 'package.json',
    regex: /"version":\s*"[^"]+"/,
    template: (version) => `"version": "${version}"`,
  },
  {
    path: 'ChromeExtension/manifest.json',
    regex: /"version":\s*"[^"]+"/,
    template: (version) => `"version": "${version}"`,
  },
  {
    path: 'src/js/main/main.tsx',
    regex: /const currentVersion = '[^']+'/,
    template: (version) => `const currentVersion = '${version}'`,
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