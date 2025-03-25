// macOS-specific Vite config
// Based on vite.config.ts but with macOS-specific changes

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import fs from 'fs-extra';

const extensions = [".js", ".ts", ".tsx"];

const devDist = "dist";
const cepDist = "cep";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", "cep");

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";

let input = {};
cepConfig.panels.map((panel) => {
  input[panel.name] = path.resolve(root, panel.mainPath);
});

const config = {
  cepConfig,
  isProduction,
  isPackage,
  isMetaPackage,
  isServe,
  debugReact,
  dir: `${__dirname}/${devDist}`,
  cepDist: cepDist,
  zxpDir: `${__dirname}/${devDist}/zxp`,
  zipDir: `${__dirname}/${devDist}/zip`,
  packages: cepConfig.installModules || [],
};

// Copy files plugin for macOS
const copyMacOSFiles = () => ({
  name: 'copy-macos-files',
  enforce: 'pre',
  async buildStart() {
    try {
      console.log('Setting up macOS-specific files...');

      // Ensure CEP directories exist
      await fs.ensureDir(path.resolve(__dirname, 'dist/cep/exec'));
      await fs.ensureDir(path.resolve(__dirname, 'dist/cep/js'));
      await fs.ensureDir(path.resolve(__dirname, 'dist/cep/jsx'));
      await fs.ensureDir(path.resolve(__dirname, 'dist/cep/sounds'));

      // Copy js folder
      const jsSrc = path.resolve(__dirname, 'src/js');
      const jsDest = path.resolve(__dirname, 'dist/cep/js');
      if (fs.existsSync(jsSrc)) {
        await fs.copy(jsSrc, jsDest);
        console.log('JS folder copied to dist/cep/js');
      }

      // Copy jsx folder
      const jsxSrc = path.resolve(__dirname, 'src/jsx');
      const jsxDest = path.resolve(__dirname, 'dist/cep/jsx');
      if (fs.existsSync(jsxSrc)) {
        await fs.copy(jsxSrc, jsxDest);
        console.log('JSX folder copied to dist/cep/jsx');
      }

      // Copy exec folder
      const execSrc = path.resolve(__dirname, 'src/exec');
      const execDest = path.resolve(__dirname, 'dist/cep/exec');
      if (fs.existsSync(execSrc)) {
        await fs.copy(execSrc, execDest);
        console.log('Exec folder copied to dist/cep/exec');
      }

      // Copy sounds folder if it exists
      const soundsSrc = path.resolve(__dirname, 'app/sounds');
      const soundsDest = path.resolve(__dirname, 'dist/cep/sounds');
      if (fs.existsSync(soundsSrc)) {
        await fs.copy(soundsSrc, soundsDest);
        console.log('Sounds folder copied to dist/cep/sounds');
      }

      // Handle ffmpeg (already handled in build-python.sh)
      console.log('FFmpeg handling is done in build-python.sh');

      // Copy Python executable from dist to CEP package
      const pyExeSrc = path.resolve(__dirname, 'dist/YoutubetoPremiere');
      const pyExeDest = path.resolve(__dirname, 'dist/cep/exec/YoutubetoPremiere');
      if (fs.existsSync(pyExeSrc)) {
        await fs.copy(pyExeSrc, pyExeDest);
        // Make sure executable permissions are set
        fs.chmodSync(pyExeDest, '755');
        console.log('Python executable copied to CEP folder');
      } else {
        console.warn('Python executable not found at:', pyExeSrc);
      }
    } catch (error) {
      console.error('Failed in copyMacOSFiles:', error);
      throw error;
    }
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    copyMacOSFiles(),
    react(),
    cep(config)
  ],
  resolve: {
    alias: [{ find: "@esTypes", replacement: path.resolve(__dirname, "src") }],
  },
  root,
  clearScreen: false,
  server: {
    port: cepConfig.port,
  },
  preview: {
    port: cepConfig.servePort,
  },
  optimizeDeps: {
    exclude: ['socket.io-client']
  },
  build: {
    sourcemap: isPackage ? cepConfig.zxp.sourceMap : cepConfig.build?.sourceMap,
    watch: process.env.NO_WATCH === 'true' ? null : {
      include: "src/jsx/**",
    },
    rollupOptions: {
      input,
      output: {
        manualChunks: {},
        format: "cjs",
        preserveModules: false,
        globals: {
          'socket.io-client': 'io'
        }
      },
      external: ['socket.io-client']
    },
    target: "chrome74",
    outDir,
    copyPublicDir: true
  },
  publicDir: 'app',
  css: {
    postcss: {
      plugins: [
        require('tailwindcss'),
        require('autoprefixer'),
      ],
    },
  },
  define: {
    'process.env.APP_VERSION': JSON.stringify(process.env.npm_package_version)
  },
}); 