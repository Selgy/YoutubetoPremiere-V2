#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const config = require('../project.config.js');

class Cleaner {
  constructor() {
    this.verbose = process.argv.includes('--verbose');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '🧹';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async cleanTempFiles() {
    this.log('Nettoyage des fichiers temporaires...');
    
    const tempPaths = [
      './temp',
      './tmp',
      './*.tmp',
      './**/*.tmp',
      './build/temp',
      './build/YoutubetoPremiere-work',
      './native-output',
      './build-native'
    ];

    for (const pattern of tempPaths) {
      try {
        if (fs.existsSync(pattern)) {
          fs.rmSync(pattern, { recursive: true, force: true });
          this.log(`Supprimé: ${pattern}`);
        }
      } catch (error) {
        this.log(`Erreur suppression ${pattern}: ${error.message}`, 'warn');
      }
    }
  }

  async cleanBuildOutputs() {
    this.log('Nettoyage des sorties de build...');
    
    const buildPaths = [
      './dist/YoutubetoPremiere',
      './dist/zxp',
      './build/output',
      './node_modules/.vite'
    ];

    for (const buildPath of buildPaths) {
      try {
        if (fs.existsSync(buildPath)) {
          fs.rmSync(buildPath, { recursive: true, force: true });
          this.log(`Supprimé: ${buildPath}`);
        }
      } catch (error) {
        this.log(`Erreur suppression ${buildPath}: ${error.message}`, 'warn');
      }
    }
  }

  async cleanPythonCache() {
    this.log('Nettoyage du cache Python...');
    
    const pythonCachePaths = [
      './__pycache__',
      './app/__pycache__',
      './**/__pycache__',
      './*.pyc',
      './**/*.pyc'
    ];

    for (const cachePath of pythonCachePaths) {
      try {
        if (fs.existsSync(cachePath)) {
          fs.rmSync(cachePath, { recursive: true, force: true });
          this.log(`Supprimé: ${cachePath}`);
        }
      } catch (error) {
        if (this.verbose) {
          this.log(`Cache non trouvé: ${cachePath}`, 'info');
        }
      }
    }
  }

  async cleanLogs() {
    this.log('Nettoyage des logs...');
    
    const logPaths = [
      './logs',
      './*.log',
      './npm-debug.log*',
      './yarn-debug.log*',
      './yarn-error.log*'
    ];

    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          fs.rmSync(logPath, { recursive: true, force: true });
          this.log(`Supprimé: ${logPath}`);
        }
      } catch (error) {
        if (this.verbose) {
          this.log(`Log non trouvé: ${logPath}`, 'info');
        }
      }
    }
  }

  async cleanOSFiles() {
    this.log('Nettoyage des fichiers système...');
    
    const osFiles = [
      './.DS_Store',
      './**/.DS_Store',
      './Thumbs.db',
      './**/Thumbs.db',
      './.Spotlight-V100',
      './.Trashes'
    ];

    for (const osFile of osFiles) {
      try {
        if (fs.existsSync(osFile)) {
          fs.rmSync(osFile, { recursive: true, force: true });
          this.log(`Supprimé: ${osFile}`);
        }
      } catch (error) {
        if (this.verbose) {
          this.log(`Fichier OS non trouvé: ${osFile}`, 'info');
        }
      }
    }
  }

  async validateStructure() {
    this.log('Validation de la structure...');
    
    const requiredDirs = [
      './app',
      './src',
      './jsx',
      './ChromeExtension',
      './scripts',
      './tools',
      './dist'
    ];

    for (const dir of requiredDirs) {
      if (!fs.existsSync(dir)) {
        this.log(`Dossier manquant: ${dir}`, 'warn');
        fs.mkdirSync(dir, { recursive: true });
        this.log(`Dossier créé: ${dir}`);
      }
    }
  }

  async organizeBuildFiles() {
    this.log('Organisation des fichiers de build...');
    
    // Déplacer les .spec vers tools s'ils ne sont pas déjà là
    const specFiles = ['./YoutubetoPremiere.spec', './youtubetopremiere.spec'];
    for (const specFile of specFiles) {
      if (fs.existsSync(specFile)) {
        const targetPath = './tools/YoutubetoPremiere.spec';
        if (!fs.existsSync(targetPath)) {
          fs.renameSync(specFile, targetPath);
          this.log(`Déplacé: ${specFile} -> ${targetPath}`);
        } else {
          fs.unlinkSync(specFile);
          this.log(`Supprimé doublon: ${specFile}`);
        }
      }
    }
  }

  async clean(type = 'all') {
    try {
      this.log(`🚀 Démarrage du nettoyage: ${type}`);
      
      switch (type) {
        case 'temp':
          await this.cleanTempFiles();
          break;
        case 'build':
          await this.cleanBuildOutputs();
          break;
        case 'cache':
          await this.cleanPythonCache();
          break;
        case 'logs':
          await this.cleanLogs();
          break;
        case 'os':
          await this.cleanOSFiles();
          break;
        case 'organize':
          await this.organizeBuildFiles();
          await this.validateStructure();
          break;
        case 'all':
        default:
          await this.cleanTempFiles();
          await this.cleanBuildOutputs();
          await this.cleanPythonCache();
          await this.cleanLogs();
          await this.cleanOSFiles();
          await this.organizeBuildFiles();
          await this.validateStructure();
          break;
      }

      this.log('✨ Nettoyage terminé avec succès!');
    } catch (error) {
      this.log(`💥 Erreur durant le nettoyage: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Exécution
if (require.main === module) {
  const cleaner = new Cleaner();
  const type = process.argv[2] || 'all';
  
  cleaner.clean(type).catch(console.error);
}

module.exports = Cleaner; 