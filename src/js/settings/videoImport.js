import { io } from 'socket.io-client';
import { evalTS, evalFile } from '../lib/utils/bolt';

const getServerIP = async () => {
    const possibleAddresses = ['localhost', '127.0.0.1', '192.168.56.1'];
    
    for (const address of possibleAddresses) {
        try {
            const response = await fetch(`http://${address}:3001/get-ip`);
            if (response.ok) {
                const data = await response.json();
                console.log('Successfully connected to server at:', address);
                return data.ip;
            }
        } catch (error) {
            console.log(`Failed to connect to ${address}:`, error);
        }
    }
    
    // If we get here, try to use the last known working IP
    const lastKnownIP = localStorage.getItem('serverIP');
    if (lastKnownIP) {
        console.log('Using last known IP:', lastKnownIP);
        return lastKnownIP;
    }
    
    console.error('Could not determine server IP, falling back to localhost');
    return 'localhost';
};

export async function setupVideoImportHandler(csInterface) {
    let socket = null;
    let reconnectInterval = null;
    const MAX_RECONNECT_ATTEMPTS = Infinity;
    let reconnectAttempts = 0;

    const serverIP = await getServerIP();

    async function connectSocket() {
        if (socket) {
            socket.close();
        }

        socket = io(`http://${serverIP}:3001`, {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            forceNew: true,
            upgrade: true,
            rememberUpgrade: true,
            rejectUnauthorized: false,
            autoConnect: true,
            withCredentials: true,
            query: { client_type: 'premiere' }
        });

        let pendingImports = new Map();
        let importedPaths = new Set();
        let importInProgress = false;
        let lastImportedPath = null;

        socket.on('connect', () => {
            console.log('Connected to Python server');
            reconnectAttempts = 0;
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            if (!reconnectInterval) {
                reconnectInterval = setInterval(() => {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect... (${reconnectAttempts})`);
                    connectSocket();
                }, 5000);
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from Python server');
            pendingImports.clear();
            importedPaths.clear();
            
            // Attempt to reconnect if not already trying
            if (!reconnectInterval) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect... (${reconnectAttempts})`);
                setTimeout(connectSocket, 5000);
            }
        });

        const importVideo = async (videoPath) => {
            try {
                if (importInProgress) {
                    console.log('Import already in progress, waiting...');
                    return;
                }

                if (lastImportedPath === videoPath) {
                    console.log(`Skipping duplicate import request for: ${videoPath}`);
                    return;
                }

                importInProgress = true;
                lastImportedPath = videoPath;
                console.log(`Starting import for: ${videoPath}`);

                const result = await evalTS('importVideoToSource', videoPath);
                console.log('Import result:', result, 'Type:', typeof result);

                let response;
                let success = false;

                if (typeof result === 'boolean' || result === 'true' || result === 'false') {
                    success = result === true || result === 'true';
                    response = {
                        success: success,
                        path: videoPath,
                        projectItem: null
                    };
                } else if (result && typeof result === 'object') {
                    success = result.success === true;
                    response = {
                        success: success,
                        path: result.path || videoPath,
                        projectItem: result.projectItem,
                        error: success ? undefined : (result.error || 'Import failed')
                    };
                } else {
                    response = {
                        success: false,
                        error: 'Invalid response format from Premiere',
                        path: videoPath,
                        projectItem: null
                    };
                }

                if (socket && socket.connected) {
                    socket.emit('import_complete', response);
                }
                return success;
            } catch (error) {
                console.error('Import failed:', error);
                if (socket && socket.connected) {
                    socket.emit('import_complete', {
                        success: false,
                        error: error.message,
                        path: videoPath
                    });
                }
                return false;
            } finally {
                importInProgress = false;
            }
        };

        socket.on('download_started', (data) => {
            console.log('Download started:', data.url);
            pendingImports.set(data.url, {
                status: 'downloading',
                startTime: Date.now()
            });
        });

        socket.on('import_video', async (data) => {
            console.log('Received import request for:', data.path);
            if (!data.path) {
                console.error('No path provided for import');
                return;
            }

            // Normalize path for Windows
            let normalizedPath = data.path.replace(/\//g, '\\');
            console.log('Normalized path for import:', normalizedPath);

            try {
                // Wait a bit to ensure the file is fully written
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Verify file exists before import
                const fs = window.cep_node.require('fs');
                if (!fs.existsSync(normalizedPath)) {
                    console.error('File does not exist at path:', normalizedPath);
                    socket.emit('import_complete', {
                        success: false,
                        error: 'File not found',
                        path: normalizedPath
                    });
                    return;
                }

                console.log('Starting import for file:', normalizedPath);
                const result = await importVideo(normalizedPath);
                console.log('Import result:', result);
            } catch (error) {
                console.error('Error during import:', error);
                socket.emit('import_complete', {
                    success: false,
                    error: error.message,
                    path: normalizedPath
                });
            }
        });

        socket.on('download_complete', async (data) => {
            console.log('Download complete:', data);
            if (!data) return;
            
            const url = data.url;
            if (url && pendingImports.has(url)) {
                pendingImports.delete(url);
            }
        });

        socket.on('download-complete', () => {
            console.log('Download completed (legacy event)');
        });

        socket.on('download_error', (data) => {
            console.error('Download error:', data.error);
            const url = data.url;
            if (pendingImports.has(url)) {
                pendingImports.delete(url);
            }
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

    // Start initial connection
    connectSocket();

    // Cleanup function
    return {
        socket,
        cleanup: () => {
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }
            if (socket) {
                socket.close();
                socket = null;
            }
        }
    };
} 