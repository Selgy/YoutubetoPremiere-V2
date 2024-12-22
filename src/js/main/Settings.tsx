import { useState, useEffect } from 'react';
import { FaDiscord, FaArrowLeft } from 'react-icons/fa';
import { openLinkInBrowser } from '../lib/utils/bolt';

interface SettingsProps {
  onBack: () => void;
}

const Settings = ({ onBack }: SettingsProps) => {
  const [notificationVolume, setNotificationVolume] = useState(30);
  const [selectedSound, setSelectedSound] = useState('default');
  const [isTestPlaying, setIsTestPlaying] = useState(false);
  const [availableSounds, setAvailableSounds] = useState<string[]>([]);

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value);
    setNotificationVolume(volume);
    localStorage.setItem('notificationVolume', volume.toString());
    
    try {
      const response = await fetch('http://localhost:3001/update-sound-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volume,
          sound: selectedSound
        })
      });
      
      if (!response.ok) {
        console.error('Failed to update sound settings');
      }
    } catch (error) {
      console.error('Error updating sound settings:', error);
    }
  };

  const handleSoundChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sound = e.target.value;
    setSelectedSound(sound);
    localStorage.setItem('notificationSound', sound);
    
    try {
      const response = await fetch('http://localhost:3001/update-sound-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volume: notificationVolume,
          sound
        })
      });
      
      if (!response.ok) {
        console.error('Failed to update sound settings');
      }
    } catch (error) {
      console.error('Error updating sound settings:', error);
    }
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
          volume: notificationVolume,
          sound: selectedSound
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
    const savedVolume = localStorage.getItem('notificationVolume');
    if (savedVolume) {
      setNotificationVolume(parseInt(savedVolume));
    }

    const savedSound = localStorage.getItem('notificationSound');
    if (savedSound) {
      setSelectedSound(savedSound);
    }

    // Fetch available sounds when component mounts
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
                  Notification Volume: {notificationVolume}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={notificationVolume}
                  onChange={handleVolumeChange}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Notification Sound
                </label>
                <select
                  value={selectedSound}
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