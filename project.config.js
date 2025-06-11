// YouTube to Premiere Pro - Configuration principale
module.exports = {
  // Configuration du projet
  project: {
    name: 'YoutubetoPremiere',
    version: '3.0.926',
    description: 'Bridge entre YouTube et Adobe Premiere Pro'
  },

  // Chemins principaux
  paths: {
    src: './src',
    app: './app',
    jsx: './jsx',
    chromeExtension: './ChromeExtension',
    scripts: './scripts',
    tools: './tools',
    build: './build',
    dist: './dist',
    temp: './build/temp',
    output: './build/output'
  },

  // Configuration CEP
  cep: {
    id: 'com.youtube.premiere',
    version: '3.0.926',
    host: 'PPRO',
    minVersion: '13.0',
    maxVersion: '99.9'
  },

  // Configuration de build
  build: {
    python: {
      entry: './app/YoutubetoPremiere.py',
      name: 'YoutubetoPremiere',
      distpath: './build/output'
    },
    extension: {
      manifest: 'manifest.xml',
      assets: ['icons', 'css', 'js'],
      output: './dist/cep'
    }
  },

  // Environnements
  env: {
    development: {
      debug: true,
      port: 8080
    },
    production: {
      debug: false,
      minify: true
    }
  }
}; 