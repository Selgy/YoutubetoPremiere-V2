const fs = require('fs');
const path = require('path');

// Get version from command line argument
const version = process.argv[2];
if (!version) {
  console.error('Usage: node version-update.js <version>');
  console.error('Example: node version-update.js 3.0.22');
  process.exit(1);
}

// Validate version format (semver)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Invalid version format. Use semver format: X.Y.Z');
  process.exit(1);
}

console.log(`\n🔄 Updating version to ${version}...\n`);

// Files to update - ALL version sources in the project
const files = [
  // Package.json
  {
    path: 'package.json',
    regex: /"version":\s*"[^"]+"/,
    template: (v) => `"version": "${v}"`,
  },
  // Python config (source of truth for backend)
  {
    path: 'app/config.py',
    regex: /APP_VERSION\s*=\s*"[^"]+"/,
    template: (v) => `APP_VERSION = "${v}"`,
  },
  // Chrome Extension manifest
  {
    path: 'Extension Youtube/Chrome/manifest.json',
    regex: /"version":\s*"[^"]+"/,
    template: (v) => `"version": "${v}"`,
  },
  // Firefox Extension manifest
  {
    path: 'Extension Youtube/Firefox/manifest.json',
    regex: /"version":\s*"[^"]+"/,
    template: (v) => `"version": "${v}"`,
  },
  // CEP Extension manifest
  {
    path: 'dist/cep/CSXS/manifest.xml',
    regex: /ExtensionBundleVersion="[^"]+"/,
    template: (v) => `ExtensionBundleVersion="${v}"`,
  },
];

let updatedCount = 0;
let skippedCount = 0;

// Update version in all files
files.forEach(file => {
  const filePath = path.join(process.cwd(), file.path);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const newContent = content.replace(file.regex, file.template(version));
    
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent);
      console.log(`✅ Updated: ${file.path}`);
      updatedCount++;
    } else {
      console.log(`⏭️  Already up to date: ${file.path}`);
      skippedCount++;
    }
  } else {
    console.log(`⚠️  File not found: ${file.path}`);
  }
});

console.log(`\n📊 Summary: ${updatedCount} updated, ${skippedCount} skipped`);
console.log(`\n✨ Version ${version} applied!\n`);