// Import CSInterface
import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';
import { setupVideoImportHandler } from './videoImport';
import { initBolt, evalFile, evalES } from '../lib/utils/bolt';

let PythonServerProcess = null;
let csInterface = null;
let fsWatcher = null;
let isProcessing = false;

// Function to check if server is already running
async function isServerRunning() {
    try {
        const response = await fetch('http://localhost:3001/health', {
            method: 'GET',
            timeout: 1000
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

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
        // Check if server is already running
        const serverRunning = await isServerRunning();
        if (serverRunning) {
            console.log("Server is already running, skipping server start");
            // Still initialize the rest of the extension
            const [nodeModules, cs] = await Promise.all([
                initializeNodeModules(),
                initializeCSInterface()
            ]);
            
            csInterface = cs;
            await initializeWithRetry(nodeModules);
            await setupScriptWatcher();
            setupVideoImportHandler(csInterface);
            return;
        }

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
            
            // Ensure Windows paths are properly quoted and escaped
            PythonExecutablePath = path.normalize(PythonExecutablePath);
            
            // Check for short path name option if path contains spaces (Windows only)
            if (PythonExecutablePath.includes(' ')) {
                try {
                    const { execSync } = window.cep_node.require('child_process');
                    // Get short path name to avoid spaces in path
                    const shortPath = execSync(`for %I in ("${PythonExecutablePath}") do @echo %~sI`, { encoding: 'utf8' }).trim();
                    if (shortPath && fs.existsSync(shortPath)) {
                        console.log('Using Windows short path to avoid spaces:', shortPath);
                        PythonExecutablePath = shortPath;
                    }
                } catch (err) {
                    console.warn('Failed to get short path name:', err.message);
                    // Continue with the original path
                }
            }
        } else if (process.platform === 'darwin') {
            PythonExecutablePath = path.join(extensionRoot, 'exec', 'YoutubetoPremiere');
        } else {
            console.error(`Unsupported platform: ${process.platform}`);
            return;
        }
        
        PythonExecutablePath = path.normalize(PythonExecutablePath);
        console.log('Corrected Python executable path:', PythonExecutablePath);

        // For macOS: Use executable directly from its original location to preserve code signature
        if (process.platform === 'darwin') {
            try {
                const { exec } = window.cep_node.require('child_process');
                
                // Look for different executable variants in original location
                const universalPath = path.join(extensionRoot, 'exec', 'YoutubetoPremiere-universal');
                const standardPath = path.join(extensionRoot, 'exec', 'YoutubetoPremiere');
                
                if (fs.existsSync(universalPath)) {
                    console.log('Found universal executable variant - using this for better compatibility');
                    PythonExecutablePath = universalPath;
                } else if (fs.existsSync(standardPath)) {
                    console.log('Using standard executable from original location');
                    PythonExecutablePath = standardPath;
                } else {
                    throw new Error('No executable found in exec directory');
                }
                
                // Only fix permissions on the original executable (do not copy to preserve signature)
                const fixPermissionsCmd = `chmod +x "${PythonExecutablePath}" && xattr -dr com.apple.quarantine "${path.dirname(PythonExecutablePath)}" 2>/dev/null || true`;
                const { error } = await new Promise(resolve => {
                    exec(fixPermissionsCmd, (error, stdout, stderr) => {
                        resolve({ error, stdout, stderr });
                    });
                });
                
                if (error) {
                    console.warn(`Failed to fix permissions: ${error.message}`);
                } else {
                    console.log('Successfully fixed executable permissions at original location');
                }
                
            } catch (err) {
                console.error('Error preparing macOS executable:', err);
                // Fallback to the original path
                console.log('Using fallback path due to error');
            }
        }

        if (!fs.existsSync(PythonExecutablePath)) {
            console.error(`Python executable not found at ${PythonExecutablePath}`);
            return;
        }

        console.log(`Starting Python server from: ${PythonExecutablePath}`);
        try {
            // For macOS, create a more robust environment
            const serverEnv = { 
                ...process.env, 
                Python_BACKTRACE: '1', 
                EXTENSION_ROOT: extensionRoot,
                PYTHONIOENCODING: 'utf-8',
                PYTHONUNBUFFERED: '1',
                // Ensure PATH is always available
                PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
            };
            
            if (process.platform === 'darwin') {
                // Set Python paths relative to the extension directory
                serverEnv.PYTHONPATH = path.join(extensionRoot, 'exec');
                serverEnv.APP_DIR = path.join(extensionRoot, 'exec');
                serverEnv.SOUNDS_DIR = path.join(extensionRoot, 'exec', 'sounds');
            }
            
            // Use child_process.exec instead of spawn for better permission handling
            const { exec } = window.cep_node.require('child_process');
            
            if (process.platform === 'win32') {
                // Windows-specific command using start command
                const cmd = `start /B "" "${PythonExecutablePath}" --verbose`;
                
                console.log('Executing Windows command:', cmd);
                PythonServerProcess = exec(cmd, {
                    cwd: path.dirname(PythonExecutablePath),
                    env: serverEnv,
                    windowsHide: false // Show window for debugging
                });
            } else if (process.platform === 'darwin') {
                // macOS-specific command - direct execution
                const cmd = `"${PythonExecutablePath}" --verbose`;
                
                console.log('Executing macOS command:', cmd);
                PythonServerProcess = exec(cmd, {
                    cwd: path.dirname(PythonExecutablePath),
                    env: serverEnv,
                    detached: true
                });
            }
            
            // Handle process events for exec
            if (PythonServerProcess) {
                // Handle standard output and error
                if (PythonServerProcess.stdout) {
                    PythonServerProcess.stdout.on('data', (data) => {
                        console.log(`Python server stdout: ${data}`);
                    });
                }
                
                if (PythonServerProcess.stderr) {
                    PythonServerProcess.stderr.on('data', (data) => {
                        console.error(`Python server stderr: ${data}`);
                    });
                }
                
                // Handle process events
                PythonServerProcess.on('error', (err) => {
                    console.error(`Failed to start Python server: ${err}`);
                    // Handle permission errors specifically
                    handleProcessPermissionError(err, PythonExecutablePath, exec, path, extensionRoot);
                });
                
                PythonServerProcess.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`Python server process exited with code ${code}`);
                    } else {
                        console.log('Python server process exited successfully');
                    }
                    PythonServerProcess = null;
                });
            }

            // Set up health check mechanism for background process
            const checkServerHealth = async () => {
                try {
                    const isRunning = await isServerRunning();
                    if (isRunning) {
                        console.log('Server health check passed');
                    } else {
                        console.warn('Server health check failed, server may not be running');
                    }
                } catch (error) {
                    console.error('Error checking server health:', error);
                }
            };
            
            // Check server health after a delay
            setTimeout(checkServerHealth, 5000);
        } catch (spawnError) {
            console.error(`Error spawning Python process: ${spawnError.message}`);
            // Don't try system Python fallback - the bundled executable should be self-contained
            throw spawnError;
        }

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
        
        // For exec processes, we need to terminate differently
        if (process.platform === 'win32') {
            // On Windows, find and terminate by looking up the process
            try {
                const { exec } = window.cep_node.require('child_process');
                exec('taskkill /F /IM YoutubetoPremiere.exe', (error) => {
                    if (error) {
                        console.error('Error terminating process:', error);
                    } else {
                        console.log('Process terminated successfully');
                    }
                });
            } catch (error) {
                console.error('Failed to terminate process:', error);
            }
        } else if (process.platform === 'darwin') {
            // On macOS, use the killall command
            try {
                const { exec } = window.cep_node.require('child_process');
                exec('killall YoutubetoPremiere', (error) => {
                    if (error) {
                        console.error('Error terminating process:', error);
                    } else {
                        console.log('Process terminated successfully');
                    }
                });
            } catch (error) {
                console.error('Failed to terminate process:', error);
            }
        }
        
        // Also try standard process termination
        try {
            PythonServerProcess.kill();
        } catch (error) {
            console.warn('Standard kill method failed:', error);
        }
        
        PythonServerProcess = null;
    }
    
    if (fsWatcher) {
        fsWatcher.close();
    }
    
    // No cleanup needed for original executable location
}

// Helper function to handle permission errors specifically
function handleProcessPermissionError(error, execPath, exec, path, extensionRoot) {
    // Check if this is a permission error
    const isPermissionError = 
        error.code === 'EACCES' || 
        error.message.includes('permission') || 
        error.message.includes('access') ||
        error.message.includes('denied');
    
    if (!isPermissionError) return;
    
    console.error('Permission error detected when spawning process');
    
    if (process.platform === 'win32') {
        // For Windows, try to launch with elevated permissions via different methods
        try {
            console.log('Attempting to relaunch with elevated permissions...');
            
            // Method 1: Try using PowerShell's Start-Process with RunAs verb
            const psCommand = `powershell.exe -Command "Start-Process -FilePath '${execPath}' -ArgumentList '--verbose' -Verb RunAs -WindowStyle Hidden"`;
            
            console.log('Executing elevation command:', psCommand);
            exec(psCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('PowerShell elevation failed:', error);
                    
                    // Method 2: Try using the built-in Windows start command as fallback
                    const startCommand = `start /B /min "" "${execPath}" --verbose`;
                    console.log('Trying fallback elevation method:', startCommand);
                    
                    exec(startCommand, (startError, startStdout, startStderr) => {
                        if (startError) {
                            console.error('Start command elevation failed:', startError);
                        } else {
                            console.log('Process started with start command');
                        }
                    });
                } else {
                    console.log('Process elevated successfully via PowerShell');
                }
            });
        } catch (elevationError) {
            console.error('Failed to launch with elevation:', elevationError);
        }
    } else if (process.platform === 'darwin') {
        // For macOS, try using AppleScript for better permission handling
        try {
            console.log('Attempting to relaunch with improved macOS permissions...');
            
            // Method 1: Use AppleScript to launch the application
            const appleScriptCommand = `tell application "Finder" to launch application "${execPath}"`;
            const osascript = `osascript -e '${appleScriptCommand}'`;
            
            console.log('Executing macOS permission command:', osascript);
            exec(osascript, (error, stdout, stderr) => {
                if (error) {
                    console.error('AppleScript launch failed:', error);
                    
                    // Method 2: Try admin privileges as fallback
                    const adminCommand = `osascript -e 'do shell script "${execPath} --verbose" with administrator privileges'`;
                    console.log('Trying admin privileges as fallback:', adminCommand);
                    
                    exec(adminCommand, (adminError, adminStdout, adminStderr) => {
                        if (adminError) {
                            console.error('Admin privileges launch failed:', adminError);
                        } else {
                            console.log('Process launched with admin privileges');
                        }
                    });
                } else {
                    console.log('Process launched via AppleScript');
                }
            });
        } catch (osascriptError) {
            console.error('Failed to launch with AppleScript:', osascriptError);
        }
    }
}

// Start the Python server when the extension loads
console.log("Background script loaded. Starting Python server...");
startPythonServer();