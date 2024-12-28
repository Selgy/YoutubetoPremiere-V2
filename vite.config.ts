import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import { extendscriptConfig } from "./vite.es.config";

const execAsync = promisify(exec);

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
const action = process.env.ACTION;

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

if (action) {
  runAction(config, action);
  process.exit();
}

// Build Python executable plugin
const buildPythonExecutable = () => ({
  name: 'build-python-executable',
  buildStart: async () => {
    try {
      console.log('Building Python executable...');
      const platform = process.platform;
      const specFile = platform === 'win32' ? 'YoutubetoPremiere.spec' : 'YoutubetoPremiere.local.spec';
      const buildDir = path.resolve(__dirname, 'build/YoutubetoPremiere');
      
      // Clean up previous build
      await fs.remove(buildDir);
      await fs.ensureDir(buildDir);
      
      // Run PyInstaller with absolute paths
      const command = `python -m PyInstaller "${path.resolve(__dirname, specFile)}" -y --workpath "${path.resolve(__dirname, 'build/work')}" --distpath "${buildDir}"`;
      console.log('Running command:', command);
      await execAsync(command);
      console.log('Python executable built successfully');
    } catch (error) {
      console.error('Failed to build Python executable:', error);
      throw error;
    }
  }
});

// Copy files plugin
const copyAppFiles = () => ({
  name: 'copy-app-files',
  enforce: 'pre' as const,  // Specify the literal type
  async buildStart() {
    if (process.env.ZXP_PACKAGE === "true") {
      try {
        console.log('Building Python executable...');
        const platform = process.platform;
        const specFile = platform === 'win32' ? 'YoutubetoPremiere.spec' : 'YoutubetoPremiere.local.spec';
        const buildDir = path.resolve(__dirname, 'build/YoutubetoPremiere');
        
        // Clean up previous build
        await fs.remove(buildDir);
        await fs.ensureDir(buildDir);
        
        // Run PyInstaller with absolute paths
        const command = `python -m PyInstaller "${path.resolve(__dirname, specFile)}" -y --workpath "${path.resolve(__dirname, 'build/work')}" --distpath "${buildDir}"`;
        console.log('Running command:', command);
        await execAsync(command);
        console.log('Python executable built successfully');

        // Copy files to dist/cep/exec
        const exeName = platform === 'win32' ? 'YoutubetoPremiere.exe' : 'YoutubetoPremiere';
        const exeSrc = path.resolve(buildDir, exeName);
        const cepExecDir = path.resolve(__dirname, 'dist/cep/exec');
        
        await fs.ensureDir(cepExecDir);
        
        // Copy executable
        if (await fs.pathExists(exeSrc)) {
          await fs.copy(exeSrc, path.resolve(cepExecDir, exeName), { overwrite: true });
          console.log('Executable copied to dist/cep/exec');
        } else {
          throw new Error('Executable not found after build');
        }

        // Copy sounds folder
        const soundsSrc = path.resolve(__dirname, 'src/exec/sounds');
        await fs.copy(soundsSrc, path.resolve(cepExecDir, 'sounds'), { overwrite: true });
        console.log('Sounds folder copied to dist/cep/exec');

      } catch (error) {
        console.error('Failed in copyAppFiles:', error);
        throw error;
      }
    }
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    copyAppFiles(),
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
    watch: {
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

// rollup es3 build
const outPathExtendscript = path.join("dist", "cep", "jsx", "index.js");
extendscriptConfig(
  `src/jsx/index.ts`,
  outPathExtendscript,
  cepConfig,
  extensions,
  isProduction,
  isPackage
);

const currentVersion = process.env.APP_VERSION || '2.1.6';
