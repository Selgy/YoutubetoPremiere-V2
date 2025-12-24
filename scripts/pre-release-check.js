#!/usr/bin/env node
/**
 * Script de vérification pré-release
 * Vérifie que tout est prêt avant de créer une release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Vérification pré-release...\n');

let errors = 0;
let warnings = 0;

// 1. Vérifier que toutes les versions sont synchronisées
console.log('📋 Vérification des versions...');
const packageJson = require('../package.json');
const VERSION = packageJson.version;

const filesToCheck = [
  {
    path: 'extensions/Chrome/manifest.json',
    getName: (data) => 'Chrome Extension',
    getVersion: (data) => JSON.parse(data).version
  },
  {
    path: 'extensions/Firefox/manifest.json',
    getName: (data) => 'Firefox Extension',
    getVersion: (data) => JSON.parse(data).version
  },
  {
    path: 'project.config.js',
    getName: (data) => 'Project Config',
    getVersion: (data) => {
      const match = data.match(/version:\s*['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    }
  },
  {
    path: 'src/js/main/main.tsx',
    getName: (data) => 'Main TSX',
    getVersion: (data) => {
      const match = data.match(/const currentVersion = ['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    }
  }
];

let allVersionsMatch = true;
filesToCheck.forEach(file => {
  const fullPath = path.join(__dirname, '..', file.path);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const version = file.getVersion(content);
    
    if (version === VERSION) {
      console.log(`  ✅ ${file.getName(content)}: ${version}`);
    } else {
      console.log(`  ❌ ${file.getName(content)}: ${version} (attendu: ${VERSION})`);
      allVersionsMatch = false;
      errors++;
    }
  } else {
    console.log(`  ⚠️  ${file.path} non trouvé`);
    warnings++;
  }
});

if (!allVersionsMatch) {
  console.log('\n❌ Les versions ne sont pas synchronisées!');
  console.log('   Exécutez: npm run sync:version\n');
}

// 2. Vérifier que git est propre
console.log('\n📝 Vérification de l\'état Git...');
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  if (gitStatus.trim()) {
    console.log('  ⚠️  Des fichiers ne sont pas committés:');
    console.log(gitStatus.split('\n').map(line => `     ${line}`).join('\n'));
    warnings++;
  } else {
    console.log('  ✅ Dépôt Git propre');
  }
} catch (error) {
  console.log('  ⚠️  Impossible de vérifier l\'état Git');
  warnings++;
}

// 3. Vérifier que les dépendances sont à jour
console.log('\n📦 Vérification des dépendances...');
try {
  const packageLock = fs.existsSync('package-lock.json');
  const yarnLock = fs.existsSync('yarn.lock');
  
  if (packageLock && yarnLock) {
    console.log('  ⚠️  Les deux package-lock.json et yarn.lock existent');
    warnings++;
  } else if (yarnLock) {
    console.log('  ✅ yarn.lock présent');
  } else if (packageLock) {
    console.log('  ✅ package-lock.json présent');
  } else {
    console.log('  ❌ Aucun fichier de lock trouvé');
    errors++;
  }
} catch (error) {
  console.log('  ⚠️  Erreur lors de la vérification des dépendances');
  warnings++;
}

// 4. Vérifier que les fichiers critiques existent
console.log('\n📁 Vérification des fichiers critiques...');
const criticalFiles = [
  'app/YoutubetoPremiere.py',
  'extensions/Chrome/manifest.json',
  'extensions/Firefox/manifest.json',
  '.github/workflows/main.yml',
  'requirements.txt'
];

criticalFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} manquant!`);
    errors++;
  }
});

// Résumé
console.log('\n' + '='.repeat(50));
console.log('📊 Résumé de la vérification:');
console.log(`   Version: ${VERSION}`);
console.log(`   ✅ Vérifications réussies`);
console.log(`   ❌ Erreurs: ${errors}`);
console.log(`   ⚠️  Avertissements: ${warnings}`);
console.log('='.repeat(50) + '\n');

if (errors > 0) {
  console.log('❌ Correction requise avant la release!');
  process.exit(1);
} else if (warnings > 0) {
  console.log('⚠️  Des avertissements ont été détectés, mais vous pouvez continuer.');
  process.exit(0);
} else {
  console.log('✅ Tout est prêt pour la release!');
  process.exit(0);
}

