import { useState, useEffect } from 'react';
import { FaDiscord, FaArrowLeft } from 'react-icons/fa';
import { openLinkInBrowser } from '../lib/utils/bolt';

interface SettingsProps {
  onBack: () => void;
}

const Settings = ({ onBack }: SettingsProps) => {
  const [settings, setSettings] = useState({
    notificationVolume: 30,
    notificationSound: 'notification_sound',
    resolution: '1080',
    downloadMP3: false,
    secondsBefore: '15',
    secondsAfter: '15',
    licenseKey: ''
  });
  const [isTestPlaying, setIsTestPlaying] = useState(false);
  const [availableSounds, setAvailableSounds] = useState<string[]>([]);
  const [serverIP, setServerIP] = useState('localhost');

  useEffect(() => {
    const storedIP = localStorage.getItem('serverIP');
    if (storedIP) {
      setServerIP(storedIP);
    }
  }, []);

  const saveSettings = async (newSettings: typeof settings) => {
    try {
      // First get current settings from server
      const response = await fetch(`http://${serverIP}:3001/settings`);
      let settingsToSave = newSettings;
      
      if (response.ok) {
        const currentServerSettings = await response.json();
        // Merge current server settings with new settings
        settingsToSave = { ...currentServerSettings, ...newSettings };
      }
      
      // Save merged settings
      setSettings(settingsToSave);
      localStorage.setItem('settings', JSON.stringify(settingsToSave));

      const saveResponse = await fetch(`http://${serverIP}:3001/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsToSave),
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      // On error, keep the local state but don't throw
      setSettings(newSettings);
      localStorage.setItem('settings', JSON.stringify(newSettings));
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value);
    const newSettings = { ...settings, notificationVolume: volume };
    await saveSettings(newSettings);
  };

  const handleSoundChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sound = e.target.value;
    const newSettings = { ...settings, notificationSound: sound };
    await saveSettings(newSettings);
  };

  const playTestSound = async () => {
    if (isTestPlaying) return;
    
    setIsTestPlaying(true);
    try {
      const response = await fetch('http://localhost:3001/test-sound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volume: settings.notificationVolume,
          sound: settings.notificationSound
        })
      });
      
      if (!response.ok) {
        console.error('Failed to play test sound');
      }
    } catch (error) {
      console.error('Error playing test sound:', error);
    } finally {
      setIsTestPlaying(false);
    }
  };

  useEffect(() => {
    // Load settings from server
    const loadSettings = async () => {
      try {
        const response = await fetch('http://localhost:3001/settings');
        if (response.ok) {
          const serverSettings = await response.json();
          setSettings(serverSettings);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();

    // Fetch available sounds
    fetch('http://localhost:3001/available-sounds')
      .then(response => response.json())
      .then(data => {
        if (data.sounds && data.sounds.length > 0) {
          setAvailableSounds(data.sounds);
        }
      })
      .catch(error => console.error('Error fetching sounds:', error));
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center mb-6 sm:mb-8">
          <button 
            onClick={onBack}
            className="mr-4 p-2 rounded-lg hover:bg-background-panel transition-colors"
          >
            <FaArrowLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
        </div>
        
        <div className="space-y-6">
          {/* Notification Settings */}
          <div className="bg-background-panel rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Notification Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">
                  Notification Volume: {settings.notificationVolume}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.notificationVolume}
                  onChange={handleVolumeChange}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Notification Sound
                </label>
                <select
                  value={settings.notificationSound}
                  onChange={handleSoundChange}
                  className="input-base mb-2"
                >
                  {availableSounds.map(sound => (
                    <option key={sound} value={sound}>
                      {sound.charAt(0).toUpperCase() + sound.slice(1)}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={playTestSound}
                  disabled={isTestPlaying}
                  className="btn w-full mt-2"
                >
                  {isTestPlaying ? 'Playing...' : 'Test Sound'}
                </button>
              </div>
            </div>
          </div>

          {/* Support Section */}
          <div className="bg-background-panel rounded-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Support</h2>
            
            <div 
              className="flex items-center justify-between bg-discord p-4 rounded-lg cursor-pointer hover:bg-discord-hover transition-colors"
              onClick={() => openLinkInBrowser('https://discord.gg/s2gfM3w47y')}
            >
              <div className="flex items-center space-x-3">
                <FaDiscord className="w-8 h-8 text-white" />
                <span className="text-white font-medium">Join our Discord Community</span>
              </div>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 