#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const config = require('../project.config.js');

class Builder {
  constructor() {
    this.platform = process.platform;
    this.config = config;
    this.verbose = process.argv.includes('--verbose');
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async ensureDirectories() {
    const dirs = [
      this.config.paths.build,
      this.config.paths.temp,
      this.config.paths.output,
      this.config.paths.dist
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.log(`Dossier créé: ${dir}`);
      }
    }
  }

  async buildPython() {
    this.log('🐍 Construction de l\'application Python...');
    
    const specFile = path.join(this.config.paths.tools, 'YoutubetoPremiere.spec');
    const command = `pyinstaller --noconfirm --onedir --windowed --name "${this.config.build.python.name}" --distpath "${this.config.build.python.distpath}" "${this.config.build.python.entry}"`;
    
    try {
      execSync(command, { 
        stdio: this.verbose ? 'inherit' : 'pipe',
        cwd: process.cwd()
      });
      this.log('Application Python construite avec succès');
      
      // Copy executable to dist folder
      await this.copyPythonExecutable();
    } catch (error) {
      this.log(`Erreur lors de la construction Python: ${error.message}`, 'error');
      throw error;
    }
  }

  async copyPythonExecutable() {
    this.log('📁 Copie de l\'exécutable Python vers dist...');
    
    try {
      const sourcePath = path.join(this.config.build.python.distpath, this.config.build.python.name);
      const destPath = path.join(this.config.paths.dist, this.config.build.python.name);
      
      // Ensure destination directory exists
      if (!fs.existsSync(this.config.paths.dist)) {
        fs.mkdirSync(this.config.paths.dist, { recursive: true });
      }
      
      // Copy the executable directory
      if (fs.existsSync(sourcePath)) {
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
        
        const copyCommand = this.platform === 'win32'
          ? `xcopy "${sourcePath}" "${destPath}" /E /I /Y`
          : `cp -r "${sourcePath}" "${destPath}"`;
        
        execSync(copyCommand, { 
          stdio: this.verbose ? 'inherit' : 'pipe'
        });
        
        this.log('Exécutable Python copié avec succès');
      } else {
        this.log(`Source path not found: ${sourcePath}`, 'warn');
      }
    } catch (error) {
      this.log(`Erreur lors de la copie de l'exécutable: ${error.message}`, 'error');
      throw error;
    }
  }

  async buildCEP() {
    this.log('🎨 Construction de l\'extension CEP...');
    
    try {
      const buildCommand = 'cross-env ZXP_PACKAGE=true vite build';
      execSync(buildCommand, { 
        stdio: this.verbose ? 'inherit' : 'pipe',
        env: { ...process.env, ZXP_PACKAGE: 'true' }
      });
      this.log('Extension CEP construite avec succès');
    } catch (error) {
      this.log(`Erreur lors de la construction CEP: ${error.message}`, 'error');
      throw error;
    }
  }

  async buildCEPDev() {
    this.log('🎨 Construction de l\'extension CEP (mode développement - sans signature ZXP)...');
    
    try {
      // Build without ZXP packaging to avoid signing issues during development
      const buildCommand = 'cross-env NODE_ENV=production vite build';
      execSync(buildCommand, { 
        stdio: this.verbose ? 'inherit' : 'pipe',
        env: { 
          ...process.env, 
          NODE_ENV: 'production',
          // Don't set ZXP_PACKAGE to avoid signing
        }
      });
      this.log('Extension CEP construite avec succès (mode développement)');
    } catch (error) {
      this.log(`Erreur lors de la construction CEP dev: ${error.message}`, 'error');
      throw error;
    }
  }

  async buildChrome() {
    this.log('🌐 Construction de l\'extension Chrome...');
    
    try {
      const sourcePath = path.join(process.cwd(), 'ChromeExtension');
      const destPath = path.join(this.config.paths.dist, 'chrome');
      
      // Ensure destination directory exists
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      
      // Copy Chrome extension files
      const copyCommand = this.platform === 'win32' 
        ? `xcopy "${sourcePath}" "${destPath}" /E /I /Y`
        : `cp -r "${sourcePath}/." "${destPath}/"`;
      
      execSync(copyCommand, { 
        stdio: this.verbose ? 'inherit' : 'pipe'
      });
      this.log('Extension Chrome construite avec succès');
    } catch (error) {
      this.log(`Erreur lors de la construction Chrome: ${error.message}`, 'error');
      throw error;
    }
  }

  async downloadFFmpeg() {
    this.log('📥 Téléchargement de FFmpeg...');
    
    const ffmpegPath = path.join(this.config.paths.dist, 'cep', this.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    
    if (fs.existsSync(ffmpegPath)) {
      this.log('FFmpeg déjà présent');
      return;
    }

    // URL selon la plateforme
    const ffmpegUrl = this.platform === 'win32' 
      ? 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
      : 'https://evermeet.cx/ffmpeg/getrelease/zip';

    try {
      const downloadScript = path.join(this.config.paths.tools, 'download-ffmpeg.js');
      if (fs.existsSync(downloadScript)) {
        execSync(`node ${downloadScript}`, { stdio: this.verbose ? 'inherit' : 'pipe' });
      }
      this.log('FFmpeg téléchargé avec succès');
    } catch (error) {
      this.log(`Erreur lors du téléchargement FFmpeg: ${error.message}`, 'warn');
    }
  }

  async clean() {
    this.log('🧹 Nettoyage des fichiers temporaires...');
    
    const tempDirs = [
      this.config.paths.temp,
      path.join(this.config.paths.build, 'YoutubetoPremiere-work'),
      './native-output',
      './build-native'
    ];

    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        this.log(`Supprimé: ${dir}`);
      }
    }
  }

  async build(target = 'all') {
    try {
      this.log(`🚀 Démarrage du build pour: ${target}`);
      
      await this.ensureDirectories();

      switch (target) {
        case 'python':
          await this.buildPython();
          break;
        case 'cep':
          await this.buildCEP();
          await this.downloadFFmpeg();
          break;
        case 'cep-dev':
          await this.buildCEPDev();
          await this.downloadFFmpeg();
          break;
        case 'chrome':
          await this.buildChrome();
          break;
        case 'dev':
          // Build all components for development (CEP without signing)
          await this.buildPython();
          await this.buildCEPDev();
          await this.buildChrome();
          await this.downloadFFmpeg();
          break;
        case 'all':
        default:
          await this.buildPython();
          await this.buildCEP();
          await this.buildChrome();
          await this.downloadFFmpeg();
          break;
      }

      this.log('✨ Build terminé avec succès!');
    } catch (error) {
      this.log(`💥 Erreur durant le build: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Exécution
if (require.main === module) {
  const builder = new Builder();
  const target = process.argv[2] || 'all';
  
  builder.build(target).catch(console.error);
}

module.exports = Builder; 