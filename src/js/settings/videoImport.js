import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';
import io from 'socket.io-client';

const csInterface = new CSInterface();
const extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

function connectWithRetry(socket) {
    socket.on('connect', () => {
        console.log('Connected to Python server');
        
        socket.on('import_video', async (data) => {
            try {
                const result = await importVideoToPremiereProject(data.path, csInterface);
                socket.emit('import_complete', { 
                    success: true, 
                    path: data.path 
                });
            } catch (error) {
                console.error('Import failed:', error);
                socket.emit('import_complete', { 
                    success: false, 
                    path: data.path,
                    error: error.message 
                });
            }
        });
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setTimeout(() => {
            socket.connect();
        }, 1000);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Python server');
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
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
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