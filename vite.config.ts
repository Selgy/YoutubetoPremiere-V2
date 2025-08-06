import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
// import { extendscriptConfig } from "./vite.es.config";

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
      // Don't throw the error, allow the build to continue
      console.log('Continuing build despite Python executable build failure');
    }
  }
});

// Copy files plugin
const copyAppFiles = () => ({
  name: 'copy-app-files',
  enforce: 'pre' as const,
  async buildStart() {
    if (process.env.ZXP_PACKAGE === "true") {
      try {
        // Skip Python build if SKIP_PYTHON_BUILD is set
        if (!process.env.SKIP_PYTHON_BUILD) {
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
        } else {
          console.log('Skipping Python build as SKIP_PYTHON_BUILD is set');
        }

        // Ensure the destination directories exist
        await fs.ensureDir(path.resolve(__dirname, 'dist/cep/js'));
        await fs.ensureDir(path.resolve(__dirname, 'dist/cep/jsx'));
        await fs.ensureDir(path.resolve(__dirname, 'dist/cep/exec'));
        await fs.ensureDir(path.resolve(__dirname, 'dist/cep/sounds'));
        await fs.ensureDir(path.resolve(__dirname, 'dist/cep/CSXS'));

        // Copy js folder
        const jsSrc = path.resolve(__dirname, 'src/js');
        const jsDest = path.resolve(__dirname, 'dist/cep/js');
        if (fs.existsSync(jsSrc)) {
          await fs.copy(jsSrc, jsDest, { overwrite: true });
          console.log('JS folder copied to dist/cep/js');
        }

        // Copy jsx folder
        const jsxSrc = path.resolve(__dirname, 'src/jsx');
        const jsxDest = path.resolve(__dirname, 'dist/cep/jsx');
        if (fs.existsSync(jsxSrc)) {
          await fs.copy(jsxSrc, jsxDest, { overwrite: true });
          console.log('JSX folder copied to dist/cep/jsx');
        }

        // Copy exec folder
        const execSrc = path.resolve(__dirname, 'src/exec');
        const execDest = path.resolve(__dirname, 'dist/cep/exec');
        if (fs.existsSync(execSrc)) {
          await fs.copy(execSrc, execDest, { 
            overwrite: true,
            filter: (src) => {
              // Skip copying sounds directory from exec - we'll handle that separately
              return !src.includes(path.join('src', 'exec', 'sounds'));
            }
          });
          console.log('Exec folder copied to dist/cep/exec');
        }

        // FFmpeg handling
        console.log('Checking for FFmpeg...');
        const ffmpegSrc = path.resolve(__dirname, 'app/ffmpeg.exe');
        const ffmpegDest = path.resolve(__dirname, 'dist/cep/exec/ffmpeg.exe');
        if (fs.existsSync(ffmpegSrc)) {
          await fs.copy(ffmpegSrc, ffmpegDest, { overwrite: true });
          console.log('FFmpeg copied to dist/cep/exec');
        } else {
          console.warn('FFmpeg not found in app directory');
        }

        // Create sounds directory if it doesn't exist in src/exec
        await fs.ensureDir(path.resolve(__dirname, 'src/exec/sounds'));

        // Copy sound files from all potential sources
        console.log('Copying sound files from all potential sources...');

        // Copy from app/sounds if they exist
        const appSoundsSrc = path.resolve(__dirname, 'app/sounds');
        const soundsDest = path.resolve(__dirname, 'dist/cep/sounds');
        const execSoundsDest = path.resolve(__dirname, 'dist/cep/exec/sounds');
        
        if (fs.existsSync(appSoundsSrc)) {
          try {
            await fs.copy(appSoundsSrc, soundsDest, { overwrite: true });
            await fs.copy(appSoundsSrc, execSoundsDest, { overwrite: true });
            console.log('Sound files copied from app/sounds');
          } catch (err) {
            console.warn('Error copying from app/sounds:', err.message);
          }
        }
        
        // Copy from src/exec/sounds if they exist
        const srcSoundsSrc = path.resolve(__dirname, 'src/exec/sounds');
        if (fs.existsSync(srcSoundsSrc)) {
          try {
            await fs.copy(srcSoundsSrc, soundsDest, { overwrite: true });
            await fs.copy(srcSoundsSrc, execSoundsDest, { overwrite: true });
            console.log('Sound files copied from src/exec/sounds');
          } catch (err) {
            console.warn('Error copying from src/exec/sounds:', err.message);
          }
        }

        // Create a placeholder file in sounds directory if it's empty
        try {
          const files = await fs.readdir(soundsDest);
          if (files.length === 0) {
            await fs.writeFile(path.join(soundsDest, '.gitkeep'), '');
            console.log('Created placeholder file in empty sounds directory');
          }
        } catch (err) {
          console.warn('Error checking sounds directory:', err.message);
        }

        // Create manifest.xml file if it doesn't exist
        const manifestPath = path.resolve(__dirname, 'dist/cep/CSXS/manifest.xml');
        if (!fs.existsSync(manifestPath)) {
          console.log('Creating basic manifest.xml...');
          const manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="6.0" ExtensionBundleId="com.youtubetopremiere" ExtensionBundleVersion="1.0.0"
  ExtensionBundleName="YoutubetoPremiere" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="com.youtubetopremiere.panel" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PPRO" Version="[15.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="9.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.youtubetopremiere.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <ScriptPath>./jsx/index.js</ScriptPath>
          <CEFCommandLine>
            <Parameter>--enable-nodejs</Parameter>
            <Parameter>--mixed-context</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>YouTube to Premiere Pro</Menu>
          <Geometry>
            <Size>
              <Height>600</Height>
              <Width>400</Width>
            </Size>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>`;
          await fs.writeFile(manifestPath, manifestContent);
        }

        // Create index.html if it doesn't exist
        const indexPath = path.resolve(__dirname, 'dist/cep/index.html');
        if (!fs.existsSync(indexPath)) {
          console.log('Creating basic index.html...');
          const indexContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>YouTube to Premiere Pro</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>YouTube to Premiere Pro</h1>
  <p>This is the YouTube to Premiere Pro extension.</p>
  <p>If you're seeing this placeholder, the full extension UI wasn't built properly.</p>
  <script src="./js/index.js"></script>
</body>
</html>`;
          await fs.writeFile(indexPath, indexContent);
        }

        // Create a basic JavaScript file if it doesn't exist
        const jsIndexPath = path.resolve(__dirname, 'dist/cep/js/index.js');
        if (!fs.existsSync(jsIndexPath)) {
          console.log('Creating basic JavaScript file...');
          await fs.ensureDir(path.resolve(__dirname, 'dist/cep/js'));
          await fs.writeFile(jsIndexPath, '// Basic JavaScript for the extension\nconsole.log("YouTube to Premiere Pro extension loaded");');
        }

        // Copy executables from build directory to CEP package
        const buildDir = path.resolve(__dirname, 'build/YoutubetoPremiere');
        const execDir = path.resolve(__dirname, 'dist/cep/exec');
        await fs.ensureDir(execDir);

        // Copy all executables from build directory
        if (fs.existsSync(buildDir)) {
          const files = await fs.readdir(buildDir);
          for (const file of files) {
            // Only copy executables and ffmpeg
            if (file.match(/^(YoutubetoPremiere)(\.exe)?$/)) {
              await fs.copy(
                path.join(buildDir, file),
                path.join(execDir, file),
                { overwrite: true }
              );
              console.log(`Copied ${file} to CEP exec directory`);
            }
          }
        }
        
        // List all files in CEP directory as debug output
        console.log('CEP extension files:');
        const cepFiles = await fs.readdir(path.resolve(__dirname, 'dist/cep'), { recursive: true });
        console.log(cepFiles);
        
      } catch (error) {
        console.error('Failed in copyAppFiles:', error);
        // Don't throw the error - allow the build to continue even if file operations fail
        console.log('Continuing build despite file operation errors');
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
    watch: process.env.NODE_ENV === 'development' && process.env.NO_WATCH !== 'true' ? {
      include: "src/jsx/**",
    } : null,
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

// rollup es3 build - temporarily disabled for Vite 6 compatibility
// const outPathExtendscript = path.join("dist", "cep", "jsx", "index.js");
// extendscriptConfig(
//   `src/jsx/index.ts`,
//   outPathExtendscript,
//   cepConfig,
//   extensions,
//   isProduction,
//   isPackage
// );

const currentVersion = process.env.APP_VERSION || '3.0.12';











































