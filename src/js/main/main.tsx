import { useEffect, useState } from 'react';
import './styles.css';
import Settings from './Settings';
import io from 'socket.io-client';

declare const window: Window & {
  cep: {
    util: {
      openURLInDefaultBrowser: (url: string) => void;
    };
    fs: {
      showOpenDialogEx: (allowMultiple: boolean, chooseDirectory: boolean, title: string, initialPath: string | null) => {
        err: number;
        data: string[] | null;
      };
    };
  };
  __adobe_cep__: any;
  CSInterface: any;
};

declare class CSInterface {
  constructor();
  evalScript(script: string, callback: (result: string) => void): void;
}

// Get the local IP address from the server
const getLocalIP = async () => {
  // For CEP environment, always use localhost for stability
  const possibleAddresses = ['localhost', '127.0.0.1'];
  
  for (const address of possibleAddresses) {
    try {
      const response = await fetch(`http://${address}:3001/health`);
      if (response.ok) {
        console.log('Successfully connected to server at:', address);
        // Always return localhost for CEP environment
        return 'localhost';
      }
    } catch (error) {
      console.log(`Failed to connect to ${address}:`, error);
    }
  }
  
  console.log('Could not connect to server, but defaulting to localhost for CEP');
  return 'localhost';
};

const Main = () => {
  const [settings, setSettings] = useState({
    resolution: '1080',
    downloadPath: '',
    downloadMP3: false,
    secondsBefore: '15',
    secondsAfter: '15',
    notificationVolume: 30,
    notificationSound: 'notification_sound',
    licenseKey: '',
  });

  const [lastPaths, setLastPaths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLicenseValid, setIsLicenseValid] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const currentVersion = '3.0.127';
  const [currentPage, setCurrentPage] = useState('main');
  const [serverIP, setServerIP] = useState('localhost');
  
  // Force localhost for all requests in CEP environment
  const getServerURL = (endpoint: string) => {
    return `http://localhost:3001${endpoint}`;
  };
  const [isCEPEnvironment, setIsCEPEnvironment] = useState(false);

  useEffect(() => {
    const checkCEPEnvironment = () => {
      const isCEP = !!(window.cep && window.__adobe_cep__);
      console.log('CEP Environment check:', isCEP);
      setIsCEPEnvironment(isCEP);
      
      if (!isCEP) {
        console.error('Not running in CEP environment - some features will be disabled');
      }
    };
    
    checkCEPEnvironment();
  }, []);

  useEffect(() => {
    const initializeConnection = async () => {
      await getLocalIP();
      // Force localhost for CEP environment
      const finalIP = 'localhost';
      localStorage.setItem('serverIP', finalIP);
      setServerIP(finalIP);
      console.log('Server IP set to:', finalIP);
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const checkLicenseAndStart = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(getServerURL('/check-license'));
        const data = await response.json();
        
        if (data.isValid) {
          setIsLicenseValid(true);
          await loadSettings();
        }
      } catch (error) {
        console.error('Error checking license:', error);
      }
      setIsLoading(false);
    };

    if (serverIP) {
      checkLicenseAndStart();
    }
  }, [serverIP]);

  useEffect(() => {
    if (serverIP) {
      checkForUpdates();
    }
  }, [serverIP]);

  useEffect(() => {
    if (!serverIP) return; // Only check if serverIP is empty/undefined

    let connectionAttempts = 0;
    const maxAttempts = 10;
    let socket: any = null;
    let useHttpFallback = false;
    let healthCheckInterval: NodeJS.Timeout | null = null;

    // Function to try WebSocket/Socket.IO connection
    const attemptSocketConnection = () => {
      if (useHttpFallback || connectionAttempts >= maxAttempts) {
        console.log('Max socket connection attempts reached, switching to HTTP fallback');
        useHttpFallback = true;
        startHttpFallback();
        return;
      }

      connectionAttempts++;
      console.log(`Socket connection attempt ${connectionAttempts}/${maxAttempts}`);

      socket = io(`http://localhost:3001`, {
        transports: ['polling'],  // Force polling only for CEP stability
        reconnection: false,  // Disable automatic reconnection
        timeout: 10000,  // Shorter timeout
        forceNew: true,  // Force new connection each time
        upgrade: false,   // Disable WebSocket upgrade for CEP
        withCredentials: false,  // Disable credentials for localhost
        query: { 
          client_type: 'premiere',
          cep_version: '1.0'
        }
      });

      socket.on('connect', () => {
        console.log('Socket connected to server successfully');
        connectionAttempts = 0; // Reset on successful connection
        useHttpFallback = false;
      });

      socket.on('connect_error', (error: any) => {
        console.log(`Socket connection error (attempt ${connectionAttempts}):`, error.message);
        socket.disconnect();
        
        // Try again after a delay, or switch to HTTP fallback
        setTimeout(() => {
          if (connectionAttempts < maxAttempts) {
            attemptSocketConnection();
          } else {
            console.log('Switching to HTTP fallback mode');
            useHttpFallback = true;
            startHttpFallback();
          }
        }, 2000);
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      socket.on('error', (error: any) => {
        console.log('Socket error:', error.message);
      });

      // Add missing event handlers for video import
      socket.on('import_video', async (data: any) => {
        console.log('Received import_video command:', data);
        try {
          const path = data.path;
          if (!path) {
            console.error('No path provided for import');
            socket.emit('import_complete', { success: false, error: 'No path provided' });
            return;
          }

          // Import the video using CEP ExtendScript
          const success = await importVideoToPremiere(path);
          
          if (success) {
            console.log('Successfully imported video:', path);
            socket.emit('import_complete', { success: true, path: path });
            showNotification('Vidéo importée avec succès', 'success');
          } else {
            console.error('Failed to import video:', path);
            socket.emit('import_complete', { success: false, path: path, error: 'Import failed' });
            showNotification('Échec de l\'importation vidéo', 'error');
          }
                 } catch (error) {
           console.error('Error importing video:', error);
           socket.emit('import_complete', { success: false, error: String(error) });
           showNotification('Erreur lors de l\'importation', 'error');
         }
      });

      socket.on('download_started', (data: any) => {
        console.log('Download started:', data);
        showNotification('Téléchargement commencé', 'info');
      });

      socket.on('download-complete', (data: any) => {
        console.log('Download completed:', data);
        showNotification('Téléchargement terminé', 'success');
      });

      socket.on('download-failed', (data: any) => {
        console.log('Download failed:', data);
        showNotification(`Échec du téléchargement: ${data.error || 'Erreur inconnue'}`, 'error');
      });

      socket.on('request_project_path', async () => {
        console.log('Server requesting project path');
        try {
          const projectPath = await getPremiereProjectPath();
          socket.emit('project_path_response', { path: projectPath });
        } catch (error) {
          console.error('Error getting project path:', error);
          socket.emit('project_path_response', { error: String(error) });
        }
      });

      socket.on('update_available', (data: any) => {
        console.log('Update available notification received:', data);
        if (data.has_update) {
          setUpdateInfo(data);
          setLatestVersion(data.latest_version);
          setUpdateAvailable(true);
          setShowUpdateModal(true);
          showNotification(`🚀 Version ${data.latest_version} disponible !`, 'info');
        }
      });
    };

    // HTTP fallback function
    const startHttpFallback = () => {
      console.log('Starting HTTP fallback mode for main panel');
      
      // Simple health check polling
      const checkServerHealth = async () => {
        try {
                   const controller = new AbortController();
         const timeoutId = setTimeout(() => controller.abort(), 5000);
         
         const response = await fetch(getServerURL('/health'), {
           method: 'GET',
           signal: controller.signal
         });
         
         clearTimeout(timeoutId);
          
          if (response.ok) {
            // Server is accessible via HTTP
            console.log('HTTP fallback: Server health check passed');
          }
        } catch (error) {
          console.log('HTTP fallback: Server health check failed:', error);
        }
      };

      // Start health check polling every 30 seconds
      healthCheckInterval = setInterval(checkServerHealth, 30000);
      
      // Initial health check
      checkServerHealth();
    };

    // Start with socket connection attempt
    attemptSocketConnection();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
      }
    };
  }, [serverIP]);

  const checkForUpdates = async () => {
    if (isCheckingUpdates) return;
    
    setIsCheckingUpdates(true);
    try {
      // Add client_type parameter to identify this as Premiere Pro extension
      const response = await fetch(getServerURL('/check-updates?client_type=premiere'));
      const data = await response.json();
      
      if (data.success) {
        setUpdateInfo(data);
        setLatestVersion(data.latest_version);
        setUpdateAvailable(data.has_update);
        
        // Show modal if update available
        if (data.has_update) {
          console.log(`Premiere Pro Extension: Update available - v${data.current_version} -> v${data.latest_version}`);
          setShowUpdateModal(true);
          showNotification(`Nouvelle version ${data.latest_version} disponible !`, 'info');
        } else {
          console.log(`Premiere Pro Extension: No updates available - v${data.current_version} is current`);
        }
      } else {
        console.error('Error checking for updates:', data.error);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = () => {
    if (updateInfo?.download_url) {
      console.log('Opening download URL:', updateInfo.download_url);
      
      if (isCEPEnvironment && window.cep) {
        // Use CEP API to open external URL
        try {
          window.cep.util.openURLInDefaultBrowser(updateInfo.download_url);
          console.log('Opened URL in default browser via CEP');
          setShowUpdateModal(false);
          showNotification('Téléchargement ouvert dans le navigateur', 'success');
        } catch (error) {
          console.error('CEP browser open failed:', error);
          // Fallback: copy URL to clipboard
          copyToClipboard(updateInfo.download_url);
        }
      } else {
        // Fallback for non-CEP environment
        try {
          window.open(updateInfo.download_url, '_blank');
          setShowUpdateModal(false);
        } catch (error) {
          console.error('window.open failed:', error);
          copyToClipboard(updateInfo.download_url);
        }
      }
    } else {
      console.error('No download URL available');
      showNotification('URL de téléchargement non disponible', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
          showNotification('URL copiée dans le presse-papiers', 'info');
          setShowUpdateModal(false);
        });
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        showNotification('URL copiée dans le presse-papiers', 'info');
        setShowUpdateModal(false);
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showNotification('Impossible de copier l\'URL. Vérifiez la console.', 'error');
    }
  };

  const handleLicenseSubmit = async () => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch(getServerURL('/validate-license'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ licenseKey }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsLicenseValid(true);
        loadSettings();
      } else {
        setErrorMessage(data.message || 'Invalid license key. Please try again.');
        setIsLicenseValid(false);
      }
    } catch (error) {
      console.error('Error validating license:', error);
      setErrorMessage('Error validating license. Please try again.');
      setIsLicenseValid(false);
    }
    
    setIsLoading(false);
  };

  const loadSettings = async () => {
    try {
      const response = await fetch(getServerURL('/settings'));
      if (response.ok) {
        const serverSettings = await response.json();
        setSettings(serverSettings);
        localStorage.setItem('settings', JSON.stringify(serverSettings));
      } else {
        const savedSettings = localStorage.getItem('settings');
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
      }

      const savedPaths = localStorage.getItem('lastPaths');
      if (savedPaths) {
        setLastPaths(JSON.parse(savedPaths));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      const savedSettings = localStorage.getItem('settings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    }
  };

  const saveSettings = async (newSettings: typeof settings) => {
    try {
      const settingsToSave = {
        ...settings,
        ...newSettings,
        notificationVolume: settings.notificationVolume,
        notificationSound: settings.notificationSound,
        licenseKey: settings.licenseKey
      };

              const saveResponse = await fetch(getServerURL('/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsToSave),
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save settings: ' + await saveResponse.text());
      }

      setSettings(settingsToSave);
      localStorage.setItem('settings', JSON.stringify(settingsToSave));
    } catch (error) {
      console.error('Error saving settings:', error);
      localStorage.setItem('settings', JSON.stringify(settings));
    }
  };

  const handlePathChange = (path: string) => {
    if (path.trim()) {
      const newPaths = [...lastPaths.filter(p => p !== path), path].slice(-5);
      setLastPaths(newPaths);
      localStorage.setItem('lastPaths', JSON.stringify(newPaths));
    }
    saveSettings({ ...settings, downloadPath: path });
  };

  const handleFolderSelect = () => {
    console.log('Browse button clicked');
    console.log('CEP Environment:', isCEPEnvironment);
    
    if (!isCEPEnvironment) {
      console.error('Cannot use folder dialog - not in CEP environment');
      return;
    }

    try {
      const result = window.cep.fs.showOpenDialogEx(false, true, "Select Download Folder", null);
      console.log('Dialog result:', result);
      
      if (result.err === 0 && result.data?.[0]) {
        const selectedPath = result.data[0];
        console.log('Selected path:', selectedPath);
        handlePathChange(selectedPath);
      } else {
        console.log('No folder selected or dialog cancelled');
      }
    } catch (error) {
      console.error("Error showing folder dialog:", error);
    }
  };

  const handleDownloadPathChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.target.value;
    const newSettings = { ...settings, downloadPath: newPath };
    setSettings(newSettings);
    
    try {
      const response = await fetch(getServerURL('/settings'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
      
      localStorage.setItem('settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving download path:', error);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // You can add visual notification logic here if needed
  };

  // Premiere Pro import functions
  const importVideoToPremiere = async (filePath: string): Promise<boolean> => {
    try {
      if (!isCEPEnvironment) {
        console.error('Cannot import video: Not in CEP environment');
        return false;
      }

      // ExtendScript to import video file
      const script = `
        try {
          if (!app.isDocumentOpen()) {
            alert('No project is open in Premiere Pro');
            'false';
          } else {
            var success = app.project.importFiles(['${filePath.replace(/\\/g, '\\\\')}'], true, app.project.rootItem, false);
            if (success) {
              'true';
            } else {
              'false';
            }
          }
        } catch (e) {
          'false';
        }
      `;

      const result = await executeExtendScript(script);
      return result === 'true';
    } catch (error) {
      console.error('Error importing video to Premiere:', error);
      return false;
    }
  };

  const getPremiereProjectPath = async (): Promise<string | null> => {
    try {
      if (!isCEPEnvironment) {
        console.error('Cannot get project path: Not in CEP environment');
        return null;
      }

      // ExtendScript to get project path
      const script = `
        try {
          if (!app.isDocumentOpen()) {
            'NO_PROJECT';
          } else {
            app.project.path || 'UNSAVED_PROJECT';
          }
        } catch (e) {
          'ERROR';
        }
      `;

      const result = await executeExtendScript(script);
      return result && result !== 'NO_PROJECT' && result !== 'UNSAVED_PROJECT' && result !== 'ERROR' ? result : null;
    } catch (error) {
      console.error('Error getting Premiere project path:', error);
      return null;
    }
  };

  const executeExtendScript = async (script: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        if (!isCEPEnvironment || !window.__adobe_cep__) {
          reject(new Error('CEP environment not available'));
          return;
        }

        // Use CEP evalScript to execute ExtendScript
        const csInterface = new CSInterface();
        csInterface.evalScript(script, (result: string) => {
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-DEFAULT to-background-panel p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl shadow-2xl p-6 sm:p-8 text-center backdrop-blur-20 border border-white border-opacity-10" 
             style={{
               background: 'linear-gradient(135deg, #1e2057 0%, #2e2f77 100%)',
               boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
             }}>
          <div className="flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-4xl text-blue-400 animate-spin">refresh</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Loading...</h2>
          <p className="text-gray-300 text-sm sm:text-base">Please wait while we check the version and settings.</p>
        </div>
      </div>
    );
  }

  if (!isLicenseValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background-DEFAULT to-background-panel p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl shadow-2xl p-6 sm:p-8 backdrop-blur-20 border border-white border-opacity-10"
             style={{
               background: 'linear-gradient(135deg, #1e2057 0%, #2e2f77 100%)',
               boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
             }}>
          <div className="text-center mb-6">
            <span className="material-symbols-outlined text-4xl text-blue-400 mb-4 block">key</span>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Enter Your License Key</h2>
          </div>
          <input
            type="text"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="Enter your key here"
            className="input-base mb-4"
          />
          <button onClick={handleLicenseSubmit} className="btn w-full">
            <span className="material-symbols-outlined mr-2">verified_user</span>
            Submit
          </button>
          {errorMessage && (
            <div className="mt-4 p-3 rounded-lg bg-red-500 bg-opacity-20 border border-red-500 border-opacity-30">
              <p className="text-red-300 text-center text-sm sm:text-base">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return currentPage === 'main' ? (
    <div className="min-h-screen bg-gradient-to-br from-background-DEFAULT to-background-panel p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header - Simple */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-blue-400">video_library</span>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Youtube to Premiere</h1>
          </div>
          <button 
            onClick={() => setCurrentPage('settings')}
            className="btn flex items-center gap-2 px-4 py-2"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
        
        <div className="space-y-4 sm:space-y-6">
          {/* Resolution Setting */}
          <div className="p-4 sm:p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-blue-400">high_quality</span>
              <label htmlFor="resolution" className="text-white font-medium">
                Resolution:
              </label>
            </div>
            <select 
              id="resolution"
              value={settings.resolution}
              onChange={(e) => saveSettings({ ...settings, resolution: e.target.value })}
              className="input-base"
            >
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="360">360p</option>
            </select>
          </div>

          {/* Download Path Setting */}
          <div className="p-4 sm:p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-blue-400">folder</span>
              <label className="text-white font-medium">
                Download Path:
              </label>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.downloadPath}
                onChange={handleDownloadPathChange}
                placeholder="If left empty, the video will be saved in a folder next to the currently open Premiere Pro project."
                className="input-base flex-1"
              />
              <button
                onClick={handleFolderSelect}
                className="btn flex items-center gap-2 px-4"
                style={{
                  background: 'linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%)',
                  minWidth: 'auto'
                }}
              >
                <span className="material-symbols-outlined">folder_open</span>
                <span>Browse</span>
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">info</span>
              If left empty, the video will be saved in a folder next to the currently open Premiere Pro project.
            </p>
          </div>

          {/* Clip Settings */}
          <div className="p-4 sm:p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-blue-400">content_cut</span>
              <label className="text-white font-medium">Clip Settings:</label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <span className="material-symbols-outlined text-xs text-blue-400">fast_rewind</span>
                  <label className="text-sm text-gray-300">Time Before:</label>
                </div>
                <select
                  value={settings.secondsBefore}
                  onChange={(e) => saveSettings({ ...settings, secondsBefore: e.target.value })}
                  className="input-base"
                >
                  <option value="0">0 sec</option>
                  <option value="5">-5 sec</option>
                  <option value="15">-15 sec</option>
                  <option value="30">-30 sec</option>
                  <option value="60">-1 min</option>
                  <option value="120">-2 min</option>
                </select>
              </div>
              
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <span className="material-symbols-outlined text-xs text-blue-400">fast_forward</span>
                  <label className="text-sm text-gray-300">Time After:</label>
                </div>
                <select
                  value={settings.secondsAfter}
                  onChange={(e) => saveSettings({ ...settings, secondsAfter: e.target.value })}
                  className="input-base"
                >
                  <option value="0">0 sec</option>
                  <option value="5">+5 sec</option>
                  <option value="15">+15 sec</option>
                  <option value="30">+30 sec</option>
                  <option value="60">+1 min</option>
                  <option value="120">+2 min</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Version and Update - Bottom */}
        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-blue-400 text-lg">
              {updateAvailable ? 'new_releases' : 'verified'}
            </span>
            <span className="text-gray-300">
              Version {currentVersion}
              {updateAvailable && (
                <span className="ml-2 text-green-400 font-semibold">
                  → {latestVersion} available!
                </span>
              )}
            </span>
          </div>
          <button 
            onClick={updateAvailable ? () => setShowUpdateModal(true) : checkForUpdates}
            disabled={isCheckingUpdates}
            className={`btn flex items-center gap-2 px-4 py-2 text-sm ${updateAvailable ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50 disabled:cursor-not-allowed ${isCheckingUpdates ? 'btn-loading' : ''}`}
          >
            {isCheckingUpdates ? (
              <>
                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                <span>Checking...</span>
              </>
            ) : updateAvailable ? (
              <>
                <span className="material-symbols-outlined text-sm">download</span>
                <span>Update</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">update</span>
                <span>Check</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Update Modal */}
      {showUpdateModal && updateInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="rounded-xl shadow-2xl max-w-md w-full p-6 backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, #1e2057 0%, #2e2f77 100%)',
                 boxShadow: '0 20px 64px rgba(0, 0, 0, 0.4)'
               }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-2xl text-green-400">new_releases</span>
                <h3 className="text-xl font-bold text-white">Update Available!</h3>
              </div>
              <button 
                onClick={() => setShowUpdateModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white hover:bg-opacity-10"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-white">
                  A new version ({updateInfo.latest_version}) is available!
                </p>
                <p className="text-sm text-gray-400">
                  Current version: {updateInfo.current_version}
                </p>
              </div>
              
              {updateInfo.release_notes && (
                <div>
                  <h4 className="text-white font-medium mb-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">description</span>
                    Release Notes:
                  </h4>
                  <div className="p-3 rounded-lg max-h-32 overflow-y-auto backdrop-blur-10 border border-white border-opacity-10"
                       style={{background: 'rgba(0, 0, 0, 0.2)'}}>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap">
                      {updateInfo.release_notes}
                    </p>
                  </div>
                </div>
              )}
              
              <div className="text-sm text-gray-400 flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">computer</span>
                  <span>OS: {updateInfo.os_type}</span>
                </div>
                {updateInfo.release_date && (
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">calendar_today</span>
                    <span>Released: {new Date(updateInfo.release_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="flex-1 px-4 py-2 rounded-lg transition-colors font-medium backdrop-blur-10 border border-white border-opacity-20 text-white hover:bg-white hover:bg-opacity-10"
              >
                Later
              </button>
              <button
                onClick={handleDownloadUpdate}
                className="flex-1 btn flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined">download</span>
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : (
    <Settings onBack={() => setCurrentPage('main')} />
  );
};

export default Main;