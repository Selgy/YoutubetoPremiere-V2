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

// Create an empty commit if there are no changes
const execSync = require('child_process').execSync;
try {
  execSync('git diff --quiet HEAD');
  // No changes detected, create empty commit
  execSync('git commit --allow-empty -m "Version bump to ' + version + '"');
} catch (error) {
  // Changes detected, normal flow will continue
}

// Clean up any leftover files in dist
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
}  