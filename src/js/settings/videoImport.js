import CSInterface from '../lib/cep/csinterface';

export function setupVideoImportHandler() {
    // Create our own CSInterface instance
    const csInterface = new CSInterface();
    
    // Load socket.io-client from CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    script.onload = () => {
        // Initialize socket after the library is loaded with retry logic
        const connectWithRetry = (retries = 5, delay = 1000) => {
            const socket = window.io('http://localhost:3001', {
                reconnectionDelay: delay,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: retries
            });

            socket.on('connect', () => {
                console.log('Connected to Python server');
            });

            socket.on('connect_error', (error) => {
                console.log('Connection error, retrying...', error);
            });

            socket.on('disconnect', () => {
                console.log('Disconnected from Python server');
            });

            socket.on('import_video', async (data) => {
                const videoPath = data.path;
                console.log('Received video path for import:', videoPath);
                
                try {
                    const result = await importVideoToPremiereProject(videoPath, csInterface);
                    console.log('Import result:', result);
                    // Notify Python server of successful import
                    socket.emit('import_complete', { success: true, path: videoPath });
                } catch (error) {
                    console.error('Error importing video:', error);
                    // Notify Python server of failed import
                    socket.emit('import_complete', { success: false, error: error.message });
                }
            });
        };

        // Start connection with retry logic
        connectWithRetry();
    };
    document.head.appendChild(script);
}

async function importVideoToPremiereProject(videoPath, csInterface) {
    const script = `
    var result = "false";
    try {
        if (!app.project) {
            throw new Error("No active project found");
        }
        
        var importedFile = app.project.importFiles([decodeURIComponent("${encodeURIComponent(videoPath.replace(/\\/g, '\\\\'))}")], 
            false, 
            app.project.rootItem, 
            false
        );
        
        if (!importedFile || importedFile.length === 0) {
            throw new Error("Import failed - no file imported");
        }
        
        importedFile[0].openInSource();
        result = "true";
    } catch(e) {
        result = "Error: " + e.toString();
    }
    result;
    `;

    return new Promise((resolve, reject) => {
        csInterface.evalScript(script, (result) => {
            if (result === "true") {
                resolve(true);
            } else {
                reject(new Error(result.replace("Error: ", "")));
            }
        });
    });
} 