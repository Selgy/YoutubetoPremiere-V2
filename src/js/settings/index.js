// Import CSInterface
import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';
import { setupVideoImportHandler } from './videoImport';
import { initBolt, evalFile, evalES } from '../lib/utils/bolt';

let PythonServerProcess = null;
let csInterface = null;
let fsWatcher = null;
let isProcessing = false;

// Wait for CEP to be ready
function initializeNodeModules() {
    return new Promise((resolve, reject) => {
        const checkCEP = () => {
            if (window.cep_node && window.cep_node.require) {
                try {
                    const nodeRequire = window.cep_node.require;
                    const modules = {
                        spawn: nodeRequire('child_process').spawn,
                        path: nodeRequire('path'),
                        fs: nodeRequire('fs')
                    };
                    resolve(modules);
                } catch (error) {
                    reject(error);
                }
            } else {
                setTimeout(checkCEP, 100);
            }
        };
        checkCEP();
    });
}

// Wait for CSInterface to be ready
function initializeCSInterface() {
    return new Promise((resolve) => {
        const checkCSInterface = () => {
            try {
                const cs = new CSInterface();
                if (cs && typeof cs.getSystemPath === 'function') {
                    resolve(cs);
                } else {
                    setTimeout(checkCSInterface, 100);
                }
            } catch (error) {
                setTimeout(checkCSInterface, 100);
            }
        };
        checkCSInterface();
    });
}

// Function to verify ExtendScript initialization
async function verifyExtendScriptInit() {
    return new Promise((resolve, reject) => {
        if (!csInterface) {
            reject(new Error('CSInterface not initialized'));
            return;
        }

        // First check if ExtendScript is accessible at all
        const basicCheck = `typeof $ !== 'undefined'`;
        csInterface.evalScript(basicCheck, (basicResult) => {
            console.log('Basic ExtendScript check result:', basicResult);
            if (basicResult !== 'true') {
                reject(new Error('Basic ExtendScript environment not available'));
                return;
            }

            // Then check if our namespace exists
            const namespaceCheck = `typeof $._ext !== 'undefined'`;
            csInterface.evalScript(namespaceCheck, (namespaceResult) => {
                console.log('ExtendScript namespace check result:', namespaceResult);
                if (namespaceResult !== 'true') {
                    reject(new Error('ExtendScript namespace not initialized'));
                    return;
                }

                // Finally check if our function exists
                const functionCheck = `typeof $._ext.importVideoToSource === 'function'`;
                csInterface.evalScript(functionCheck, (functionResult) => {
                    console.log('ExtendScript function check result:', functionResult);
                    if (functionResult === 'true') {
                        console.log('ExtendScript successfully initialized');
                        resolve(true);
                    } else {
                        console.error('ExtendScript function not available');
                        reject(new Error('ExtendScript function not available'));
                    }
                });
            });
        });
    });
}

// Function to initialize ExtendScript with retries
async function initializeExtendScript(nodeModules, maxRetries = 5, delayMs = 1000) {
    const { fs } = nodeModules;
    const extRoot = csInterface.getSystemPath('extension');
    console.log('Extension root path:', extRoot);

    // First try to load the main ExtendScript file
    const jsxSrc = `${extRoot}/jsx/index.js`;
    const jsxBinSrc = `${extRoot}/jsx/index.jsxbin`;
    const importVideoSrc = `${extRoot}/js/settings/importVideo.jsx`;

    try {
        // Initialize bolt
        initBolt();

        // Load main ExtendScript file
        if (fs.existsSync(jsxSrc)) {
            console.log('Loading JSX from:', jsxSrc);
            await evalFile(jsxSrc);
        } else if (fs.existsSync(jsxBinSrc)) {
            console.log('Loading JSXBIN from:', jsxBinSrc);
            await evalFile(jsxBinSrc);
        } else {
            console.warn('No main ExtendScript file found');
        }

        // Load import video script
        if (fs.existsSync(importVideoSrc)) {
            console.log('Loading import video script from:', importVideoSrc);
            await evalFile(importVideoSrc);
        } else {
            throw new Error('Import video script not found at: ' + importVideoSrc);
        }

        // Verify ExtendScript initialization
        await verifyExtendScriptInit();
        console.log('ExtendScript initialization successful');
        return true;
    } catch (error) {
        console.error('ExtendScript initialization failed:', error);
        throw error;
    }
}

// Function to retry initialization
async function initializeWithRetry(nodeModules, maxRetries = 5, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting ExtendScript initialization (attempt ${attempt}/${maxRetries})`);
            await initializeExtendScript(nodeModules);
            return true;
        } catch (error) {
            console.error(`ExtendScript initialization attempt ${attempt} failed:`, error);
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw new Error('ExtendScript initialization failed after all retries');
}

// Function to execute ExtendScript and write result
async function executeExtendScript(script) {
    return new Promise((resolve, reject) => {
        if (!csInterface) {
            reject(new Error('CSInterface not initialized'));
            return;
        }

        csInterface.evalScript(script, (result) => {
            if (result === 'EvalScript error.') {
                reject(new Error('ExtendScript evaluation failed'));
            } else {
                resolve(result);
            }
        });
    });
}

// Function to watch for script files and execute them
async function setupScriptWatcher() {
    const { path, fs } = await initializeNodeModules();
    const os = require('os');
    const tempDir = process.env.TEMP || process.env.TMP || os.tmpdir();
    if (!tempDir) {
        throw new Error("Unable to determine temporary directory.");
    }
    const watchDir = path.join(tempDir, 'YoutubetoPremiere');
        
    // Create directory if it doesn't exist
    if (!fs.existsSync(watchDir)) {
        fs.mkdirSync(watchDir, { recursive: true });
    }

    console.log('Watching directory:', watchDir);

    // Clean up existing watcher if any
    if (fsWatcher) {
        fsWatcher.close();
    }

    // Set up new watcher
    fsWatcher = fs.watch(watchDir, async (eventType, filename) => {
        if (filename === 'script.jsx' && !isProcessing) {
            isProcessing = true;
            const scriptPath = path.join(watchDir, 'script.jsx');
            const resultPath = path.join(watchDir, 'result.txt');

            try {
                // Wait a bit to ensure the file is fully written
                await new Promise(resolve => setTimeout(resolve, 500));

                if (fs.existsSync(scriptPath)) {
                    console.log('Found script at:', scriptPath);
                    const script = fs.readFileSync(scriptPath, 'utf8');
                    console.log('Executing script:', script);
                    
                    // Execute the script
                    const result = await executeExtendScript(script);
                    console.log('Script execution result:', result);

                    // Write the result
                    fs.writeFileSync(resultPath, result || 'false');

                    // If the script was successful, ensure the source monitor is updated
                    if (result === 'true') {
                        // Add a delay to ensure Premiere has time to process
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Force source monitor update using QE DOM
                        const updateMonitorScript = `
                        try {
                            if (qe && qe.source && qe.source.player) {
                                qe.source.player.play();
                                qe.source.player.stop();
                                "true";
                            } else {
                                "false";
                            }
                        } catch(e) {
                            "Error: " + e.toString();
                        }`;
                        
                        await executeExtendScript(updateMonitorScript);
                    }
                }
            } catch (error) {
                console.error('Error executing script:', error);
                fs.writeFileSync(resultPath, 'Error: ' + error.message);
            } finally {
                isProcessing = false;
            }
        }
    });

    // Initial cleanup of any existing files
    try {
        const scriptPath = path.join(watchDir, 'script.jsx');
        const resultPath = path.join(watchDir, 'result.txt');
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
        if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
    } catch (error) {
        console.error('Error cleaning up files:', error);
    }
}

async function startPythonServer() {
    console.log("Starting Python server...");
    try {
        // Wait for both Node.js modules and CSInterface to be available
        const [nodeModules, cs] = await Promise.all([
            initializeNodeModules(),
            initializeCSInterface()
        ]);
        
        const { spawn, path, fs } = nodeModules;
        csInterface = cs; // Store CSInterface instance globally
        const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
        console.log('Extension root path:', extensionRoot);

        // Initialize ExtendScript bridge with retries
        await initializeWithRetry(nodeModules);

        // Set up script watcher after CSInterface is initialized
        await setupScriptWatcher();

        // Pass csInterface to setupVideoImportHandler
        setupVideoImportHandler(csInterface);

        let PythonExecutablePath;
        if (process.platform === 'win32') {
            PythonExecutablePath = path.join(extensionRoot, 'exec', 'YoutubetoPremiere.exe');
        } else if (process.platform === 'darwin') {
            PythonExecutablePath = path.join(extensionRoot, 'exec', 'YoutubetoPremiere');
        } else {
            console.error(`Unsupported platform: ${process.platform}`);
            return;
        }
        
        PythonExecutablePath = path.normalize(PythonExecutablePath);
        console.log('Corrected Python executable path:', PythonExecutablePath);

        if (!fs.existsSync(PythonExecutablePath)) {
            console.error(`Python executable not found at ${PythonExecutablePath}`);
            return;
        }

        PythonServerProcess = spawn(PythonExecutablePath, [], {
            cwd: path.dirname(PythonExecutablePath),
            env: {...process.env, Python_BACKTRACE: '1', EXTENSION_ROOT: extensionRoot},
            stdio: ['inherit', 'pipe', 'pipe'],
            detached: false
        });

        PythonServerProcess.stdout.on('data', (data) => {
            console.log(`Python server stdout: ${data}`);
        });

        PythonServerProcess.stderr.on('data', (data) => {
            console.error(`Python server stderr: ${data}`);
        });

        PythonServerProcess.on('error', (err) => {
            console.error(`Failed to start Python server: ${err}`);
        });

        PythonServerProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python server process exited with code ${code}`);
            } else {
                console.log('Python server process exited successfully');
            }
            PythonServerProcess = null;
        });

        // Set up event listeners only after everything is initialized
        csInterface.addEventListener('com.adobe.csxs.events.ApplicationBeforeQuit', stopPythonServer);
        window.addEventListener('unload', stopPythonServer);
        
    } catch (error) {
        console.error('Error starting Python server:', error);
        throw error;
    }
}

function stopPythonServer() {
    if (PythonServerProcess) {
        console.log("Stopping Python server...");
        PythonServerProcess.kill();
    }
    if (fsWatcher) {
        fsWatcher.close();
    }
}

// Start the Python server when the extension loads
console.log("Background script loaded. Starting Python server...");
startPythonServer();