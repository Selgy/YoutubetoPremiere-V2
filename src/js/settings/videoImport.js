import { io } from 'socket.io-client';
import { evalTS, evalFile } from '../lib/utils/bolt';

export function setupVideoImportHandler(csInterface) {
    const socket = io('http://localhost:3001', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    let pendingImports = new Map();
    let importedPaths = new Set();
    let importInProgress = false;
    let lastImportedPath = null;

    socket.on('connect', () => {
        console.log('Connected to Python server');
    });

    socket.on('download_started', (data) => {
        console.log('Download started:', data.url);
        pendingImports.set(data.url, {
            status: 'downloading',
            startTime: Date.now()
        });
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

            // Use evalTS to call the ExtendScript function
            const result = await evalTS('importVideoToSource', videoPath);
            console.log('Import result:', result, 'Type:', typeof result);

            let response;
            let success = false;

            // Handle boolean responses and string 'true'/'false'
            if (typeof result === 'boolean' || result === 'true' || result === 'false') {
                console.log('Handling boolean/string-boolean response:', result);
                success = result === true || result === 'true';
                response = {
                    success: success,
                    path: videoPath,
                    projectItem: null
                };
                console.log('Created boolean response:', response);
            }
            // Handle object response
            else if (result && typeof result === 'object') {
                console.log('Handling object response:', result);
                success = result.success === true;
                response = {
                    success: success,
                    path: result.path || videoPath,
                    projectItem: result.projectItem,
                    error: success ? undefined : (result.error || 'Import failed')
                };
                console.log('Created object response:', response);
            }
            // Handle invalid response
            else {
                console.log('Handling invalid response:', result);
                response = {
                    success: false,
                    error: 'Invalid response format from Premiere',
                    path: videoPath,
                    projectItem: null
                };
                console.log('Created invalid response:', response);
            }

            console.log('Final success:', success, 'Final response:', response);
            socket.emit('import_complete', response);
            return success;
        } catch (error) {
            console.error('Import failed:', error);
            socket.emit('import_complete', {
                success: false,
                error: error.message,
                path: videoPath
            });
            return false;
        } finally {
            importInProgress = false;
        }
    };

    socket.on('import_video', async (data) => {
        console.log('Received import request for:', data.path);
        try {
            await importVideo(data.path);
        } catch (error) {
            console.error('Error during import:', error);
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

    socket.on('disconnect', () => {
        console.log('Disconnected from Python server');
        pendingImports.clear();
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

    return socket;
} 