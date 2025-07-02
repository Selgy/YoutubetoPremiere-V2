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
    preferredAudioLanguage: 'original',
    useYouTubeAuth: false
  });
  const [isTestPlaying, setIsTestPlaying] = useState(false);
  const [availableSounds, setAvailableSounds] = useState<string[]>([]);
  const [serverIP, setServerIP] = useState('localhost');
  const [isOpeningLogsFolder, setIsOpeningLogsFolder] = useState(false);
  const [isOpeningSoundsFolder, setIsOpeningSoundsFolder] = useState(false);


  useEffect(() => {
    const storedIP = localStorage.getItem('serverIP');
    if (storedIP) {
      setServerIP(storedIP);
    }
  }, []);

  const saveSettings = async (newSettings: typeof settings) => {
    try {
      // First get current settings from server
      const response = await fetch(`http://${serverIP}:3002/settings`);
      let settingsToSave = newSettings;
      
      if (response.ok) {
        const currentServerSettings = await response.json();
        // Merge current server settings with new settings
        settingsToSave = { ...currentServerSettings, ...newSettings };
      }
      
      // Save merged settings
      setSettings(settingsToSave);
      localStorage.setItem('settings', JSON.stringify(settingsToSave));

      const saveResponse = await fetch(`http://${serverIP}:3002/settings`, {
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
      const response = await fetch(`http://${serverIP}:3002/test-sound`, {
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
        const response = await fetch(`http://${serverIP}:3002/settings`);
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
    fetch(`http://${serverIP}:3002/available-sounds`)
      .then(response => response.json())
      .then(data => {
        if (data.sounds && data.sounds.length > 0) {
          setAvailableSounds(data.sounds);
        }
      })
      .catch(error => console.error('Error fetching sounds:', error));
  }, [serverIP]);

  const openLogsFolder = async () => {
    if (isOpeningLogsFolder) return;
    
    setIsOpeningLogsFolder(true);
    try {
      console.log('Opening logs folder...');
      console.log('Server IP:', serverIP);
      
      const response = await fetch(`http://${serverIP}:3002/open-logs-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Logs folder opened successfully:', result.path);
      } else {
        const errorData = await response.json();
        console.error('Failed to open logs folder:', errorData.error);
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
    } finally {
      setIsOpeningLogsFolder(false);
    }
  };

  const openSoundsFolder = async () => {
    if (isOpeningSoundsFolder) return;
    
    setIsOpeningSoundsFolder(true);
    try {
      console.log('Opening sounds folder...');
      console.log('Server IP:', serverIP);
      
      const response = await fetch(`http://${serverIP}:3002/open-sounds-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Sounds folder opened successfully:', result.path);
        
        // Refresh available sounds after opening the folder
        setTimeout(() => {
          fetch(`http://${serverIP}:3002/available-sounds`)
            .then(response => response.json())
            .then(data => {
              if (data.sounds && data.sounds.length > 0) {
                setAvailableSounds(data.sounds);
                console.log('Refreshed available sounds:', data.sounds);
              }
            })
            .catch(error => console.error('Error refreshing sounds:', error));
        }, 1000); // Small delay to allow user to add files
      } else {
        const errorData = await response.json();
        console.error('Failed to open sounds folder:', errorData.error);
      }
    } catch (error) {
      console.error('Error opening sounds folder:', error);
    } finally {
      setIsOpeningSoundsFolder(false);
    }
  };



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
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  
                  <button
                    onClick={openSoundsFolder}
                    disabled={isOpeningSoundsFolder}
                    className={`btn w-full flex items-center justify-center gap-2 ${isOpeningSoundsFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{
                      background: isOpeningSoundsFolder 
                        ? 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)'
                        : 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                    }}
                  >
                    <span className="material-symbols-outlined">
                      {isOpeningSoundsFolder ? 'hourglass_empty' : 'folder_open'}
                    </span>
                    {isOpeningSoundsFolder ? 'Opening...' : 'Open Sounds Folder'}
                  </button>
                </div>
                
                <p className="text-sm text-gray-400 mt-3 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">info</span>
                  To add custom notification sounds, click "Open Sounds Folder" and place your .mp3 or .wav files there
                </p>
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
              <h2 className="text-xl font-semibold text-white">Support & Logs</h2>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => openLinkInBrowser('https://discord.gg/s2gfM3w47y')}
                  className="btn w-full flex items-center justify-center gap-3"
                  style={{
                    background: 'linear-gradient(135deg, #5865F2 0%, #4752C4 100%)'
                  }}
                >
                  <span className="material-symbols-outlined">chat</span>
                  <span>Discord Support</span>
                </button>
                
                <button
                  onClick={openLogsFolder}
                  disabled={isOpeningLogsFolder}
                  className={`btn w-full flex items-center justify-center gap-3 ${isOpeningLogsFolder ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{
                    background: isOpeningLogsFolder 
                      ? 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)'
                      : 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)'
                  }}
                >
                  <span className="material-symbols-outlined">
                    {isOpeningLogsFolder ? 'hourglass_empty' : 'folder_open'}
                  </span>
                  <span>{isOpeningLogsFolder ? 'Opening...' : 'Open Logs Folder'}</span>
                </button>
              </div>
              
              <div className="text-center">
                <p className="text-gray-400 text-sm flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-xs">help</span>
                  Having issues? Open the logs folder to view real-time logs or ask for help on Discord
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