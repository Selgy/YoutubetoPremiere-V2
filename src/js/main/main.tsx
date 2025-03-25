import { useEffect, useState } from 'react';
import './styles.css';
import Settings from './Settings';
import io from 'socket.io-client';
import CSInterface from '../lib/cep/csinterface';
import { SystemPath } from '../lib/cep/csinterface';

declare const window: Window & {
  cep: any;
  __adobe_cep__: any;
};

// Get the local IP address from the server
const getLocalIP = async () => {
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

const Main = () => {
  const [settings, setSettings] = useState({
    resolution: '1080',
    downloadPath: '',
    downloadMP3: false,
    secondsBefore: '15',
    secondsAfter: '15',
    notificationVolume: 30,
    notificationSound: 'notification_sound',
    licenseKey: ''
  });

  const [lastPaths, setLastPaths] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLicenseValid, setIsLicenseValid] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const currentVersion = '3.0.0-clear'; // Get this from your package.json
  const [currentPage, setCurrentPage] = useState('main');
  const [serverIP, setServerIP] = useState('localhost');
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
        const response = await fetch(`http://${serverIP}:3001/check-license`);
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

    const socket = io(`http://${serverIP}:3001`, {
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
      query: { client_type: 'chrome' }
    });

    let retryCount = 0;
    const maxRetries = Infinity;

    socket.on('connect', () => {
      console.log('Connected to server');
      retryCount = 0;
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      retryCount++;
      
      console.log(`Retrying connection (attempt ${retryCount})`);
      setTimeout(() => {
        socket.connect();
      }, Math.min(1000 * Math.pow(2, retryCount % 10), 10000));
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect' || reason === 'transport close') {
        setTimeout(() => {
          console.log('Attempting to reconnect...');
          socket.connect();
        }, 1000);
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
      setTimeout(() => {
        console.log(`Retrying after error (attempt ${retryCount})`);
        socket.connect();
      }, Math.min(1000 * Math.pow(2, retryCount % 10), 10000));
    });

    // Force initial connection
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [serverIP]);

  const checkForUpdates = async () => {
    try {
      const response = await fetch(`http://${serverIP}:3001/get-version`);
      const data = await response.json();
      const latestVersion = data.version;
      setLatestVersion(latestVersion);
      
      // Compare versions
      const isNewer = compareVersions(latestVersion, currentVersion);
      setUpdateAvailable(isNewer);
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  };

  const compareVersions = (latest: string, current: string) => {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
      if (latestParts[i] > currentParts[i]) return true;
      if (latestParts[i] < currentParts[i]) return false;
    }
    return false;
  };

  const handleLicenseSubmit = async () => {
    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch(`http://${serverIP}:3001/validate-license`, {
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
      const response = await fetch(`http://${serverIP}:3001/settings`);
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

      const saveResponse = await fetch(`http://${serverIP}:3001/settings`, {
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
      const response = await fetch(`http://${serverIP}:3001/settings`, {
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md bg-background-panel rounded-xl shadow-lg p-6 sm:p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">Loading...</h2>
          <p className="text-gray-300 text-sm sm:text-base">Please wait while we check the version and settings.</p>
        </div>
      </div>
    );
  }

  if (!isLicenseValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md bg-background-panel rounded-xl shadow-lg p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-4 sm:mb-6">Enter Your License Key</h2>
          <input
            type="text"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="Enter your key here"
            className="input-base mb-4"
          />
          <button onClick={handleLicenseSubmit} className="btn w-full">
            Submit
          </button>
          {errorMessage && <p className="text-red-500 mt-4 text-center text-sm sm:text-base">{errorMessage}</p>}
        </div>
      </div>
    );
  }

  return currentPage === 'main' ? (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Youtube to Premiere</h1>
          <button 
            onClick={() => setCurrentPage('settings')}
            className="btn flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
        
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-background-panel rounded-lg p-4 sm:p-6">
            <label htmlFor="resolution" className="block text-white font-medium mb-2">
              Resolution:
            </label>
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

          <div className="mb-6">
            <label className="block text-white font-medium mb-2">
              Download Path:
            </label>
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
                className="bg-primary hover:bg-primary/80 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Browse
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              If left empty, the video will be saved in a folder next to the currently open Premiere Pro project.
            </p>
          </div>

          <div className="bg-background-panel rounded-lg p-4 sm:p-6">
            <label className="block text-white font-medium mb-4">Clip Settings:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-sm text-gray-300 mb-1 block">Time Before:</label>
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
                <label className="text-sm text-gray-300 mb-1 block">Time After:</label>
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
      </div>
      <div className="mt-8 text-center">
        <p className="text-gray-400 text-sm">
          Current Version: {currentVersion}
          {updateAvailable && (
            <span className="text-primary ml-2">
              (Update {latestVersion} available)
            </span>
          )}
        </p>
      </div>
    </div>
  ) : (
    <Settings onBack={() => setCurrentPage('main')} />
  );
};

export default Main;