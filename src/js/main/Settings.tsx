import { useState, useEffect } from 'react';
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
    licenseKey: '',
    preferredAudioLanguage: 'original'
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

  const handleAudioLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const language = e.target.value;
    const newSettings = { ...settings, preferredAudioLanguage: language };
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
    <div className="min-h-screen bg-gradient-to-br from-background-DEFAULT to-background-panel p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6 sm:mb-8">
          <button 
            onClick={onBack}
            className="mr-4 p-3 rounded-xl transition-all duration-300 backdrop-blur-20 border border-white border-opacity-10 hover:bg-white hover:bg-opacity-10"
            style={{
              background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)'
            }}
          >
            <span className="material-symbols-outlined text-white">arrow_back</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl text-blue-400">settings</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Notification Settings */}
          <div className="p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-2xl text-blue-400">notifications</span>
              <h2 className="text-xl font-semibold text-white">Notification Settings</h2>
            </div>
            
            <div className="space-y-6">
              {/* Volume Slider */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-blue-400">volume_up</span>
                  <label className="text-white font-medium">
                    Notification Volume: {settings.notificationVolume}%
                  </label>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.notificationVolume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    style={{
                      background: `linear-gradient(to right, #4e52ff 0%, #4e52ff ${settings.notificationVolume}%, rgba(255,255,255,0.1) ${settings.notificationVolume}%, rgba(255,255,255,0.1) 100%)`
                    }}
                  />
                </div>
              </div>

              {/* Sound Selection */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-blue-400">music_note</span>
                  <label className="text-white font-medium">
                    Notification Sound
                  </label>
                </div>
                <select
                  value={settings.notificationSound}
                  onChange={handleSoundChange}
                  className="input-base mb-3"
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
                  className={`btn w-full flex items-center justify-center gap-2 ${isTestPlaying ? 'btn-loading' : ''}`}
                >
                  <span className="material-symbols-outlined">
                    {isTestPlaying ? 'volume_up' : 'play_arrow'}
                  </span>
                  {isTestPlaying ? 'Playing...' : 'Test Sound'}
                </button>
              </div>
            </div>
          </div>

          {/* Audio Language Settings */}
          <div className="p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-2xl text-blue-400">language</span>
              <h2 className="text-xl font-semibold text-white">Audio Language Settings</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-blue-400">record_voice_over</span>
                  <label className="text-white font-medium">
                    Preferred Audio Language
                  </label>
                </div>
                <select
                  value={settings.preferredAudioLanguage}
                  onChange={handleAudioLanguageChange}
                  className="input-base"
                >
                  <option value="original">Original</option>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                  <option value="ru">Russian</option>
                  <option value="ja">Japanese</option>
                  <option value="ko">Korean</option>
                  <option value="zh">Chinese</option>
                </select>
                <p className="text-sm text-gray-400 mt-2 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">info</span>
                  When available, videos will be downloaded with this audio language
                </p>
              </div>
            </div>
          </div>

          {/* Support Section */}
          <div className="p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-2xl text-blue-400">support_agent</span>
              <h2 className="text-xl font-semibold text-white">Support & Community</h2>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={() => openLinkInBrowser('https://discord.gg/your-discord-server')}
                className="btn w-full flex items-center justify-center gap-3"
                style={{
                  background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)'
                }}
              >
                <span className="material-symbols-outlined">chat</span>
                <span>Join Discord Community</span>
              </button>
              
              <div className="text-center">
                <p className="text-gray-400 text-sm flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">help</span>
                  Get help, report bugs, and suggest features
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="p-6 rounded-xl backdrop-blur-20 border border-white border-opacity-10"
               style={{
                 background: 'linear-gradient(135deg, rgba(46, 47, 119, 0.3) 0%, rgba(30, 32, 87, 0.3) 100%)',
                 boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
               }}>
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-2xl text-blue-400">tune</span>
              <h2 className="text-xl font-semibold text-white">Advanced Settings</h2>
            </div>
            
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-white border-opacity-10"
                   style={{background: 'rgba(0, 0, 0, 0.2)'}}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-yellow-400">warning</span>
                  <h3 className="text-white font-medium">Server Connection</h3>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  Current server IP: <span className="text-blue-400 font-mono">{serverIP}</span>
                </p>
                <p className="text-gray-400 text-xs">
                  The extension automatically detects the server IP address. If you're experiencing connection issues, 
                  try restarting the application.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings; 