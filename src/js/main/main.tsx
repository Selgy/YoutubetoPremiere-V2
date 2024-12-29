import { useEffect, useState } from 'react';
import './styles.css';
import Settings from './Settings';

const Main = () => {
  const [settings, setSettings] = useState({
    resolution: '1080',
    downloadPath: '',
    downloadMP3: false,
    secondsBefore: '15',
    secondsAfter: '15'
  });

  const [lastPaths, setLastPaths] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLicenseValid, setIsLicenseValid] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const currentVersion = '3.0.11'; // Get this from your package.json
  const [currentPage, setCurrentPage] = useState('main');

  useEffect(() => {
    const checkLicenseAndStart = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:3001/check-license');
        const data = await response.json();
        
        if (data.isValid) {
          setIsLicenseValid(true);
          loadSettings();
        }
      } catch (error) {
        console.error('Error checking license:', error);
      }
      setIsLoading(false);
    };

    checkLicenseAndStart();
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const response = await fetch('http://localhost:3001/get-version');
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
      const response = await fetch('http://localhost:3001/validate-license', {
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

  const loadSettings = () => {
    // Load settings from localStorage or your preferred storage method
    const savedSettings = localStorage.getItem('settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    const savedPaths = localStorage.getItem('lastPaths');
    if (savedPaths) {
      setLastPaths(JSON.parse(savedPaths));
    }
  };

  const saveSettings = async (newSettings: typeof settings) => {
    setSettings(newSettings);
    localStorage.setItem('settings', JSON.stringify(newSettings));

    try {
      const response = await fetch('http://localhost:3001/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
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

          <div className="bg-background-panel rounded-lg p-4 sm:p-6">
            <label htmlFor="download-path" className="block text-white font-medium mb-2">
              Download Path:
            </label>
            <div className="relative">
              <input
                type="text"
                id="download-path"
                value={settings.downloadPath}
                onChange={(e) => handlePathChange(e.target.value)}
                placeholder="Enter path here"
                className="input-base pr-12"
              />
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-primary rounded-md hover:bg-primary-hover transition-colors"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <span className="transform transition-transform duration-200" style={{ transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
              </button>
              
              {showDropdown && lastPaths.length > 0 && (
                <ul className="absolute w-full mt-1 bg-background-panel border border-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {lastPaths.map((path, index) => (
                    <li 
                      key={index}
                      onClick={() => {
                        handlePathChange(path);
                        setShowDropdown(false);
                      }}
                      className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-white text-sm sm:text-base"
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-gray-400 text-xs sm:text-sm mt-2">
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