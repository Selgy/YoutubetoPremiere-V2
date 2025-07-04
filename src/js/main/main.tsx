import { useEffect, useState } from 'react';
import './main.scss';
import Settings from './Settings';
import io from 'socket.io-client';
import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';
import { AppLauncher } from '../lib/utils';

declare const window: Window & {
  cep: any;
  __adobe_cep__: any;
};

// Get the local IP address from the server
const getLocalIP = async () => {
  const possibleAddresses = ['localhost', '127.0.0.1', '192.168.56.1'];
  
  for (const address of possibleAddresses) {
    try {
      const response = await fetch(`http://${address}:3002/get-ip`);
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLicenseValid, setIsLicenseValid] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const currentVersion = '3.0.0';
  const [currentPage, setCurrentPage] = useState('main');
  const [serverIP, setServerIP] = useState('localhost');
  const [isCEPEnvironment, setIsCEPEnvironment] = useState(false);
  const [appLauncher] = useState(() => AppLauncher.getInstance());

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
    const startPythonApp = async () => {
      if (!isCEPEnvironment) {
        console.log('Not in CEP environment, skipping app start');
        return;
      }

      try {
        console.log('Starting Python application...');
        const started = await appLauncher.startApp();
        
        if (started) {
          console.log('Waiting for server to be ready...');
          const serverReady = await appLauncher.waitForServer();
          
          if (serverReady) {
            console.log('Python application started and server is ready!');
            setServerIP('localhost');
          } else {
            console.error('Server failed to start within timeout');
          }
        } else {
          console.error('Failed to start Python application');
        }
      } catch (error) {
        console.error('Error starting Python application:', error);
      }
    };

    if (isCEPEnvironment) {
      startPythonApp();
    }

    // Cleanup: stop app when component unmounts
    return () => {
      if (isCEPEnvironment && appLauncher.isRunning()) {
        appLauncher.stopApp();
      }
    };
  }, [isCEPEnvironment, appLauncher]);

  useEffect(() => {
    const initializeConnection = async () => {
      const ip = await getLocalIP();
      if (ip !== 'localhost') {
        localStorage.setItem('serverIP', ip);
      }
      setServerIP(ip);
      console.log('Server IP set to:', ip);
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const checkLicenseAndStart = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`http://${serverIP}:3002/check-license`);
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

    if (serverIP !== 'localhost') {
      checkLicenseAndStart();
    }
  }, [serverIP]);

  useEffect(() => {
    if (serverIP !== 'localhost') {
      checkForUpdates();
    }
  }, [serverIP]);

  useEffect(() => {
    if (serverIP === 'localhost') return;

    const socket = io(`http://${serverIP}:3002`, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: true,
      rejectUnauthorized: false,
      autoConnect: true,
      withCredentials: true,
      query: { client_type: 'premiere' }
    });

    let retryCount = 0;
    const maxRetries = Infinity;

    socket.on('connect', () => {
      console.log('Connected to server');
      retryCount = 0;
    });

    socket.on('connect_error', (error: any) => {
      console.error('Connection error:', error);
      retryCount++;
      
      console.log(`Retrying connection (attempt ${retryCount})`);
      setTimeout(() => {
        socket.connect();
      }, Math.min(1000 * Math.pow(2, retryCount % 10), 10000));
    });

    socket.on('disconnect', (reason: any) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect' || reason === 'transport close') {
        setTimeout(() => {
          console.log('Attempting to reconnect...');
          socket.connect();
        }, 1000);
      }
    });

    socket.on('error', (error: any) => {
      console.error('Socket error:', error);
      setTimeout(() => {
        console.log(`Retrying after error (attempt ${retryCount})`);
        socket.connect();
      }, Math.min(1000 * Math.pow(2, retryCount % 10), 10000));
    });

    // Add handlers for download and import events (no notifications - Chrome extension handles UI feedback)
    socket.on('download_started', (data: any) => {
      console.log('Download started:', data.url);
    });

    socket.on('progress', (data: any) => {
      console.log('Download progress:', data);
    });

    socket.on('complete', (data: any) => {
      console.log('Download complete:', data);
    });

    socket.on('download_error', (data: any) => {
      console.error('Download error:', data);
    });

    socket.on('import_complete', (data: any) => {
      console.log('Import complete:', data);
    });

    socket.on('import_failed', (data: any) => {
      console.error('Import failed:', data);
    });

    // Force initial connection
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [serverIP]);

  const checkForUpdates = async () => {
    if (isCheckingUpdates) return;
    
    setIsCheckingUpdates(true);
    try {
      const response = await fetch(`http://${serverIP}:3002/check-updates`);
      const data = await response.json();
      
      if (data.success) {
        setUpdateInfo(data);
        setLatestVersion(data.latest_version);
        setUpdateAvailable(data.has_update);
        
        // Show modal if update available
        if (data.has_update) {
          setShowUpdateModal(true);
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
    if (updateAvailable && updateInfo) {
      setShowUpdateModal(true);
    } else if (updateInfo?.download_url) {
      window.open(updateInfo.download_url, '_blank');
    }
  };

  const handleLicenseSubmit = async () => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch(`http://${serverIP}:3002/validate-license`, {
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
      const response = await fetch(`http://${serverIP}:3002/settings`);
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

      const saveResponse = await fetch(`http://${serverIP}:3002/settings`, {
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
      const response = await fetch(`http://${serverIP}:3002/settings`, {
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
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Create a simple notification toast
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      font-size: 14px;
      font-weight: 500;
      max-width: 350px;
      word-wrap: break-word;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 4000);
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
            <div className="flex gap-3">
              <input
                type="text"
                value={settings.downloadPath}
                onChange={handleDownloadPathChange}
                placeholder="Leave empty to use default project folder"
                className="input-base flex-1 min-w-0"
              />
              <button
                onClick={handleFolderSelect}
                className="btn flex items-center gap-2 px-4 flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #2e2f77 0%, #4e52ff 100%)',
                  minWidth: 'max-content'
                }}
              >
                <span className="material-symbols-outlined">folder_open</span>
                <span className="hidden sm:inline">Browse</span>
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
                onClick={() => {
                  if (updateInfo?.download_url) {
                    window.open(updateInfo.download_url, '_blank');
                  }
                  setShowUpdateModal(false);
                }}
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


























