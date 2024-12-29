import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';
import io from 'socket.io-client';

const csInterface = new CSInterface();
const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

function connectWithRetry(socket) {
    let importedPaths = new Set();
    
    socket.on('connect', () => {
        console.log('Connected to Python server');
        
        socket.on('import_video', async (data) => {
            const path = data.path;
            
            // Check if we've already imported this path
            if (importedPaths.has(path)) {
                console.log('Skipping duplicate import:', path);
                return;
            }
            
            importedPaths.add(path);
            
            try {
                const result = await importVideoToPremiereProject(path, csInterface);
                socket.emit('import_complete', { 
                    success: true, 
                    path: path 
                });
            } catch (error) {
                console.error('Import failed:', error);
                socket.emit('import_complete', { 
                    success: false, 
                    path: path,
                    error: error.message 
                });
            } finally {
                // Remove the path after a delay to prevent rapid re-imports
                setTimeout(() => {
                    importedPaths.delete(path);
                }, 5000);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Python server');
        // Clear the imported paths set on disconnect
        importedPaths.clear();
    });

    socket.on('request_project_path', async () => {
        try {
            const script = `
                if (app.project) {
                    app.project.path;
                } else {
                    "NO_PROJECT";
                }
            `;
            
            csInterface.evalScript(script, (result) => {
                if (result && result !== "NO_PROJECT") {
                    socket.emit('project_path_response', { path: result });
                } else {
                    socket.emit('project_path_response', { path: null });
                }
            });
        } catch (error) {
            console.error('Error getting project path:', error);
            socket.emit('project_path_response', { path: null });
        }
    });
}

export function setupVideoImportHandler() {
    // Create script element for Socket.IO
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    
    script.onload = () => {
        // Verify we have a valid extension path
        if (!extensionPath || extensionPath === "Invalid Input Params") {
            console.error('Invalid extension path:', extensionPath);
            return;
        }
        
        // Construct proper ExtendScript path
        const extendScriptPath = extensionPath + '/js/settings/importVideo.jsx';
        
        // Normalize path for the current platform
        const normalizedPath = extendScriptPath
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/');
        
        console.log('Loading ExtendScript from:', normalizedPath);
        
        // Load ExtendScript file with debug logging
        csInterface.evalScript(`
            try {
                $.writeln("Attempting to load: " + "${normalizedPath}");
                $.evalFile("${normalizedPath}");
                "true";
            } catch(e) {
                $.writeln("Error details: " + e.toString());
                "Error loading ExtendScript: " + e.toString();
            }
        `, (result) => {
            console.log('ExtendScript load result:', result);
            if (result !== "true") {
                console.error('Failed to load ExtendScript:', result);
                return;
            }
            
            // Continue with socket setup
            const socket = io('http://localhost:3001', {
                transports: ['polling', 'websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 60000,
                autoConnect: true,
                forceNew: true,
                upgrade: true,
                rejectUnauthorized: false,
                path: '/socket.io/',
                withCredentials: false,
                query: { client_type: 'premiere' },
                transportOptions: {
                    polling: {
                        extraHeaders: {},
                        timeout: 60000
                    }
                }
            });
            
            // Enhanced connection handling
            socket.io.on("reconnect_attempt", (attempt) => {
                console.log(`Attempting to reconnect... (Attempt ${attempt})`);
                // Try both transports on reconnect
                socket.io.opts.transports = ['polling', 'websocket'];
                socket.io.opts.upgrade = true;
            });

            socket.io.on("reconnect", (attempt) => {
                console.log(`Successfully reconnected after ${attempt} attempts`);
                // Reset connection options after successful reconnect
                socket.io.opts.transports = ['polling', 'websocket'];
                socket.io.opts.upgrade = true;
            });

            socket.io.on("reconnect_error", (error) => {
                console.error('Reconnection error:', error);
                // On error, try to reconnect with a clean slate
                socket.disconnect();
                setTimeout(() => {
                    socket.io.opts.transports = ['polling', 'websocket'];
                    socket.io.opts.upgrade = true;
                    socket.connect();
                }, 1000);
            });

            socket.io.on("reconnect_failed", () => {
                console.error('Failed to reconnect after all attempts');
                // Try to create a new connection with both transport options
                socket.disconnect();
                setTimeout(() => {
                    socket.io.opts.transports = ['polling', 'websocket'];
                    socket.io.opts.upgrade = true;
                    socket.connect();
                }, 5000);
            });

            socket.on('error', (error) => {
                console.error('Socket error:', error);
                // Handle socket errors gracefully
                if (socket.connected) {
                    socket.disconnect();
                }
                setTimeout(() => {
                    socket.io.opts.transports = ['polling', 'websocket'];
                    socket.io.opts.upgrade = true;
                    socket.connect();
                }, 2000);
            });

            socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                // Reset connection on error with both transport options
                socket.disconnect();
                setTimeout(() => {
                    socket.io.opts.transports = ['polling', 'websocket'];
                    socket.io.opts.upgrade = true;
                    socket.connect();
                }, 2000);
            });

            connectWithRetry(socket);
        });
    };
    
    script.onerror = (error) => {
        console.error('Failed to load socket.io script:', error);
    };
    
    document.head.appendChild(script);
}

async function importVideoToPremiereProject(videoPath, csInterface) {
    const escapedPath = videoPath.replace(/\\/g, '\\\\');
    // First check if the function exists
    const checkScript = `typeof $._ext !== 'undefined' && typeof $._ext.importVideoToSource === 'function'`;
    
    return new Promise((resolve, reject) => {
        // First check if our function exists
        csInterface.evalScript(checkScript, (exists) => {
            if (exists !== "true") {
                reject(new Error("Import function not available. ExtendScript may not be loaded."));
                return;
            }

            // If function exists, call it
            const script = `$._ext.importVideoToSource("${escapedPath}");`;
            csInterface.evalScript(script, (result) => {
                if (result === "EvalScript error.") {
                    reject(new Error("ExtendScript evaluation failed"));
                } else if (result === "true") {
                    resolve(true);
                } else {
                    reject(new Error(result.replace("Error: ", "")));
                }
            });
        });
    });
} 