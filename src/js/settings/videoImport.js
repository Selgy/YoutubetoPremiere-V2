import { io } from 'socket.io-client';
import { evalTS, evalFile, evalES } from '../lib/utils/bolt';

const getServerIP = async () => {
    // Prioritize 127.0.0.1 to avoid firewall/antivirus issues
    const possibleAddresses = ['127.0.0.1', 'localhost'];
    
    for (const address of possibleAddresses) {
        try {
            // First try health check to see if server is running
            const healthController = new AbortController();
            const healthTimeout = setTimeout(() => healthController.abort(), 2000);
            
            const healthResponse = await fetch(`http://${address}:17845/health`, {
                signal: healthController.signal
            });
            clearTimeout(healthTimeout);
            
            if (healthResponse.ok) {
                console.log('Server health check passed for:', address);
                
                // Then try to get the IP  
                try {
                    const ipController = new AbortController();
                    const ipTimeout = setTimeout(() => ipController.abort(), 2000);
                    
                    const response = await fetch(`http://${address}:17845/get-ip`, {
                        signal: ipController.signal
                    });
                    clearTimeout(ipTimeout);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log('Successfully connected to server at:', address, 'with IP:', data.ip);
                        
                        // FORCE 127.0.0.1 to avoid firewall/antivirus issues
                        if (address === 'localhost' || address === '127.0.0.1') {
                            console.log('🔒 Forcing 127.0.0.1 instead of', data.ip, 'to bypass security restrictions');
                            return '127.0.0.1';
                        }
                        
                        return data.ip;
                    }
                } catch (ipError) {
                    console.log(`IP endpoint failed for ${address}, using address directly:`, ipError);
                    // If get-ip fails but health check passed, use the address directly
                    // Force 127.0.0.1 for security bypass
                    if (address === 'localhost' || address === '127.0.0.1') {
                        console.log('🔒 Forcing 127.0.0.1 for security bypass');
                        return '127.0.0.1';
                    }
                    return address;
                }
            }
        } catch (error) {
            console.log(`Failed to connect to ${address}:`, error);
        }
    }
    
    // If we get here, try to use the last known working IP
    const lastKnownIP = localStorage.getItem('serverIP');
    if (lastKnownIP && lastKnownIP !== 'localhost') {
        console.log('Trying last known IP:', lastKnownIP);
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(`http://${lastKnownIP}:17845/health`, {
                signal: controller.signal
            });
            clearTimeout(timeout);
            
            if (response.ok) {
                console.log('Last known IP still works:', lastKnownIP);
                return lastKnownIP;
            }
        } catch (error) {
            console.log('Last known IP failed:', error);
        }
    }
    
    console.log('Could not determine server IP, falling back to 127.0.0.1 for security compatibility');
    return '127.0.0.1';
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

        socket = io(`http://${serverIP}:17845`, {
            transports: ['polling'], // Force polling only to avoid WebSocket instability
            reconnection: true,
            reconnectionAttempts: 10, // More attempts
            reconnectionDelay: 2000, // Longer delays
            reconnectionDelayMax: 10000,
            timeout: 30000, // Longer timeout
            forceNew: true,
            upgrade: false, // Disable upgrade to WebSocket
            rememberUpgrade: false,
            autoConnect: true,
            query: { client_type: 'premiere' }
        });

        let pendingImports = new Map();
        let importedPaths = new Set();
        let importInProgress = false;
        let lastImportedPath = null;

        socket.on('connect', () => {
            console.log('✅ CEP Extension connected to Python server');
            console.log('- Socket ID:', socket.id);
            console.log('- Transport:', socket.io.engine.transport.name);
            console.log('- Connected at:', new Date().toISOString());
            reconnectAttempts = 0;
            if (reconnectInterval) {
                clearInterval(reconnectInterval);
                reconnectInterval = null;
            }

            // Proactively push the current project path so the server
            // never has to do a round-trip request (which can time out).
            const pathScript = `app.project ? app.project.path : ""`;
            csInterface.evalScript(pathScript, (result) => {
                if (result && result !== 'undefined' && result !== '') {
                    console.log('📁 Pushing project path to server:', result);
                    socket.emit('project_path_response', { path: result });
                }
            });

            // Test connectivity every 30 seconds
            const healthCheck = setInterval(() => {
                if (socket.connected) {
                    console.log('🔍 Connection health check - Socket still connected');
                } else {
                    console.error('❌ Connection health check - Socket disconnected!');
                    clearInterval(healthCheck);
                }
            }, 30000);
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            if (!reconnectInterval && reconnectAttempts < 5) {
                reconnectInterval = setInterval(() => {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect... (${reconnectAttempts}/5)`);
                    if (reconnectAttempts >= 5) {
                        clearInterval(reconnectInterval);
                        reconnectInterval = null;
                        console.log('Max reconnection attempts reached for video import handler');
                        // Try to fall back to localhost
                        localStorage.removeItem('serverIP');
                        return;
                    }
                    connectSocket();
                }, 5000);
            }
        });

        socket.on('disconnect', (reason) => {
            console.error('❌ CEP Extension disconnected from Python server');
            console.error('- Reason:', reason || 'unknown');
            console.error('- Time:', new Date().toISOString());
            console.error('- Socket ID was:', socket.id);

            pendingImports.clear();
            importedPaths.clear();

            // 'io client disconnect' means WE closed the socket (e.g. at the top of
            // connectSocket). Don't schedule a reconnect — connectSocket already handles it.
            if (!reconnectInterval && reason !== 'io client disconnect') {
                reconnectAttempts++;
                console.log(`🔄 Attempting to reconnect... (${reconnectAttempts})`);
                setTimeout(connectSocket, 5000);
            }
        });

        const importVideo = async (videoPath, binPath = '') => {
            try {
                if (importInProgress) {
                    console.log('Import already in progress, waiting...');
                    return;
                }

                // Include binPath in the dedup key so changing the bin allows re-import
                const importKey = `${videoPath}::${binPath}`;
                if (lastImportedPath === importKey) {
                    console.log(`Skipping duplicate import request for: ${videoPath} (bin: ${binPath || 'root'})`);
                    return;
                }

                importInProgress = true;
                lastImportedPath = importKey;
                console.log(`Starting import for: ${videoPath}`);

                // binPath comes from server event (data.bin) - most reliable source
                // Falls back to localStorage if not provided
                const effectiveBin = binPath || JSON.parse(localStorage.getItem('settings') || '{}').premiereBin || '';
                console.log(`Import target bin: "${effectiveBin || '(root)'}"`);

                const result = await evalTS('importVideoToSource', videoPath, effectiveBin);
                console.log('Import result:', result, 'Type:', typeof result);
                
                // Give a bit more time on Mac for response to fully serialize
                if (navigator.platform.indexOf('Mac') > -1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                
                // On Mac, undefined result is a known timing issue (CEP bridge serialization)
                // Do NOT run diagnostics in this case - diagnostic files don't exist and
                // calling $.evalFile() on missing files triggers Adobe crash report dialogs
                const isMacPlatform = navigator.platform.indexOf('Mac') > -1;
                if (result === undefined && isMacPlatform) {
                    console.log('Mac: undefined result detected, skipping diagnostics (timing issue, handled below)');
                }

                let response;
                let success = false;

                // Handle JSON string response from ExtendScript
                if (typeof result === 'string') {
                    try {
                        const parsedResult = JSON.parse(result);
                        success = parsedResult.success === true;
                        response = {
                            success: success,
                            path: parsedResult.path || videoPath,
                            projectItem: parsedResult.projectItem,
                            error: success ? undefined : (parsedResult.error || 'Import failed')
                        };
                    } catch (parseError) {
                        console.error('Failed to parse ExtendScript result:', parseError);
                        // Fallback: try boolean string parsing
                        success = result === 'true';
                        response = {
                            success: success,
                            path: videoPath,
                            projectItem: null,
                            error: success ? undefined : 'Failed to parse import result'
                        };
                    }
                } else if (typeof result === 'boolean' || result === 'true' || result === 'false') {
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
                    // On Mac, undefined can mean success but response timing issue
                    // Check if we're on Mac and result is undefined
                    const isMac = navigator.platform.indexOf('Mac') > -1;
                    if (isMac && result === undefined) {
                        console.log('Mac: Undefined result, assuming success due to timing');
                        response = {
                            success: true,
                            path: videoPath,
                            projectItem: null,
                            note: 'Success assumed on Mac due to response timing'
                        };
                        success = true;
                    } else {
                        response = {
                            success: false,
                            error: 'Invalid response format from Premiere',
                            path: videoPath,
                            projectItem: null
                        };
                    }
                }

                if (socket && socket.connected) {
                    socket.emit('import_complete', response);
                }
                return success;
            } catch (error) {
                console.error('Import error caught:', error);
                
                // On Mac, assume success to avoid additional ExtendScript calls that can crash
                // User reports: "error dialog appears but file is imported successfully"
                const isMac = navigator.platform.indexOf('Mac') > -1;
                if (isMac) {
                    console.log('Mac: Error caught but assuming success (import likely succeeded despite CEP timing issue)');
                    // Give Premiere a moment to finish
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                    // Treat as success without additional verification to prevent crash
                    if (socket && socket.connected) {
                        socket.emit('import_complete', {
                            success: true,
                            path: videoPath,
                            note: 'Mac: Success assumed due to CEP Bridge timing (no verification to prevent crash)'
                        });
                    }
                    return true;
                }
                
                // On Windows, report the error normally
                if (socket && socket.connected) {
                    socket.emit('import_complete', {
                        success: false,
                        error: error.message || String(error),
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
            console.log('📥 Received import_video event from Python server');
            console.log('- Data received:', JSON.stringify(data, null, 2));
            console.log('- Socket connected:', socket.connected);
            console.log('- Time:', new Date().toISOString());
            console.log('Received import request for:', data.path);
            
            if (!data.path) {
                console.error('❌ No path provided for import');
                return;
            }

            // Use original path as-is (no normalization needed for macOS)
            let normalizedPath = data.path;
            console.log('Path for import:', normalizedPath);

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
                const result = await importVideo(normalizedPath, data.bin || '');
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

        socket.on('download-failed', (data) => {
            console.error('Download failed:', data.message || data.error);
            // Clean up any pending imports
            pendingImports.clear();
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