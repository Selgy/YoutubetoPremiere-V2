#!/usr/bin/env node
/**
 * Script de synchronisation des versions
 * Utilise package.json comme source unique de vérité
 * Met à jour automatiquement toutes les versions dans le projet
 */

const fs = require('fs');
const path = require('path');

// Source de vérité : package.json
const packageJson = require('../package.json');
const VERSION = packageJson.version;

console.log(`🔄 Synchronisation des versions vers ${VERSION}...`);

const filesToUpdate = [
  {
    path: path.join('extensions', 'Chrome', 'manifest.json'),
    update: (content) => {
      const data = JSON.parse(content);
      data.version = VERSION;
      return JSON.stringify(data, null, 4);
    }
  },
  {
    path: path.join('extensions', 'Firefox', 'manifest.json'),
    update: (content) => {
      const data = JSON.parse(content);
      data.version = VERSION;
      return JSON.stringify(data, null, 4);
    }
  },
  {
    path: path.join('extensions', 'Chrome', 'content.js'),
    update: (content) => {
      return content.replace(
        /console\.log\('YTP: Content script loaded - Version [\d.]+ /,
        `console.log('YTP: Content script loaded - Version ${VERSION} `
      );
    }
  },
  {
    path: path.join('extensions', 'Firefox', 'content.js'),
    update: (content) => {
      return content.replace(
        /console\.log\('YTP: Content script loaded - Version [\d.]+ /,
        `console.log('YTP: Content script loaded - Version ${VERSION} `
      );
    }
  },
  {
    path: 'project.config.js',
    update: (content) => {
      return content.replace(
        /version: '[\d.]+'/g,
        `version: '${VERSION}'`
      );
    }
  },
  {
    path: 'src/js/main/main.tsx',
    update: (content) => {
      return content.replace(
        /const currentVersion = '[\d.]+'/,
        `const currentVersion = '${VERSION}'`
      );
    }
  },
  {
    path: 'version.json',
    update: () => {
      return JSON.stringify({
        version: VERSION,
        buildDate: new Date().toISOString().split('T')[0],
        description: 'Source unique de vérité pour les versions'
      }, null, 2);
    }
  },
  {
    path: 'app/config.py',
    update: (content) => {
      return content.replace(
        /APP_VERSION = ["'][\d.]+["']/,
        `APP_VERSION = "${VERSION}"`
      );
    }
  }
];

let successCount = 0;
let errorCount = 0;

filesToUpdate.forEach(file => {
  const fullPath = path.join(__dirname, '..', file.path);
  
  try {
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  Fichier non trouvé: ${file.path}`);
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    const updated = file.update(content);
    fs.writeFileSync(fullPath, updated, 'utf8');
    
    console.log(`✅ ${file.path}`);
    successCount++;
  } catch (error) {
    console.error(`❌ Erreur avec ${file.path}:`, error.message);
    errorCount++;
  }
});

console.log(`\n📊 Résumé:`);
console.log(`   ✅ ${successCount} fichiers mis à jour`);
console.log(`   ❌ ${errorCount} erreurs`);
console.log(`   🎯 Version synchronisée: ${VERSION}`);

if (errorCount > 0) {
  process.exit(1);
}

