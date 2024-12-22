import { useEffect, useState } from 'react';
import './styles.css';

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

  useEffect(() => {
    const checkLicenseAndStart = async () => {
      setIsLoading(true);
      const savedKey = localStorage.getItem('licenseKey');
      if (savedKey) {
        const isValid = await validateLicenseKey(savedKey);
        if (isValid) {
          setIsLicenseValid(true);
          startServer();
          loadSettings();
        }
      }
      setIsLoading(false);
    };

    checkLicenseAndStart();
  }, []);

  const validateLicenseKey = async (key: string) => {
    try {
      // Validate with Gumroad
      const gumroadResponse = await fetch('https://api.gumroad.com/v2/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: '9yYJT15dJO3wB4Z74N-EUg==',
          license_key: key
        })
      });

      if (gumroadResponse.ok) {
        const data = await gumroadResponse.json();
        if (data.success) return true;
      }

      // If Gumroad fails, try Shopify
      const apiToken = 'eHyU10yFizUV5qUJaFS8koE1nIx2UCDFNSoPVdDRJDI7xtunUK6ZWe40vfwp';
      const shopifyResponse = await fetch(
        `https://app-easy-product-downloads.fr/api/get-license-key?license_key=${encodeURIComponent(key)}&api_token=${encodeURIComponent(apiToken)}`,
        { method: 'POST' }
      );

      if (shopifyResponse.ok) {
        const data = await shopifyResponse.json();
        return data.status === 'success';
      }

      return false;
    } catch (error) {
      console.error('License validation error:', error);
      return false;
    }
  };

  const handleLicenseSubmit = async () => {
    setIsLoading(true);
    setErrorMessage('');
    
    const isValid = await validateLicenseKey(licenseKey);
    if (isValid) {
      localStorage.setItem('licenseKey', licenseKey);
      setIsLicenseValid(true);
      startServer();
      loadSettings();
    } else {
      setErrorMessage('Invalid license key. Please try again.');
    }
    setIsLoading(false);
  };

  const startServer = async () => {
    try {
      const extensionPath = await window.cep.fs.getSystemPath('extension');
      const execPath = `${extensionPath}/exec/YoutubetoPremiere.exe`;
      window.cep.process.createProcess(execPath, "");
    } catch (error) {
      console.error('Error starting YoutubetoPremiere:', error);
    }
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
      <div className="loading-section">
        <h2>Loading...</h2>
        <p>Please wait while we check the version and settings.</p>
      </div>
    );
  }

  if (!isLicenseValid) {
    return (
      <div className="license-section">
        <h2>Enter Your License Key</h2>
        <input
          type="text"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
          placeholder="Enter your key here"
        />
        <button onClick={handleLicenseSubmit}>Submit</button>
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Youtube to Premiere Settings</h1>
      
      <label htmlFor="resolution">Resolution:</label>
      <select 
        id="resolution"
        value={settings.resolution}
        onChange={(e) => saveSettings({ ...settings, resolution: e.target.value })}
      >
        <option value="1080">1080p</option>
        <option value="720">720p</option>
        <option value="480">480p</option>
        <option value="360">360p</option>
      </select>

      <label htmlFor="download-path">Download Path:</label>
      <div className="input-container">
        <input
          type="text"
          id="download-path"
          className="path-input"
          value={settings.downloadPath}
          onChange={(e) => handlePathChange(e.target.value)}
          placeholder="Enter path here"
        />
        <button 
          className="dropdown-button"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          ▼
        </button>
        
        {showDropdown && lastPaths.length > 0 && (
          <ul className="paths-dropdown">
            {lastPaths.map((path, index) => (
              <li 
                key={index}
                onClick={() => {
                  handlePathChange(path);
                  setShowDropdown(false);
                }}
              >
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="path-info">
        If left empty, the video will be saved in a folder next to the currently open Premiere Pro project.
      </p>

      <div className="clip-settings">
        <label>Clip Settings:</label>
        <div className="input-container">
          <select
            value={settings.secondsBefore}
            onChange={(e) => saveSettings({ ...settings, secondsBefore: e.target.value })}
          >
            <option value="0">0 sec</option>
            <option value="5">-5 sec</option>
            <option value="15">-15 sec</option>
            <option value="30">-30 sec</option>
            <option value="60">-1 min</option>
            <option value="120">-2 min</option>
          </select>
        </div>
        
        <div className="input-container">
          <select
            value={settings.secondsAfter}
            onChange={(e) => saveSettings({ ...settings, secondsAfter: e.target.value })}
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
  );
};

export default Main;