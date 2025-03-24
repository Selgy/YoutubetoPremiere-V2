/**
 * macPermissions.js
 * Utility module to handle macOS-specific permissions and quarantine issues
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const CSInterface = require('./cep/csinterface');

/**
 * Checks if the current platform is macOS
 * @returns {boolean} True if running on macOS
 */
const isMacOS = () => process.platform === 'darwin';

/**
 * Gets the path to the executable directory
 * @returns {string} Path to the exec directory
 */
const getExecDir = () => {
  const cs = new CSInterface();
  const extensionRoot = cs.getSystemPath(CSInterface.SystemPath.EXTENSION);
  return path.join(extensionRoot, 'exec');
};

/**
 * Gets a list of all executables in the exec directory
 * @returns {Promise<string[]>} Array of executable paths
 */
const getExecutables = async () => {
  const execDir = getExecDir();
  const files = ['YoutubetoPremiere', 'ffmpeg'];
  return files.map(file => path.join(execDir, file));
};

/**
 * Checks if a file has the quarantine attribute
 * @param {string} filePath Path to the file to check
 * @returns {Promise<boolean>} True if the file is quarantined
 */
const isFileQuarantined = (filePath) => {
  return new Promise((resolve) => {
    if (!isMacOS()) {
      resolve(false);
      return;
    }

    exec(`xattr -l "${filePath}" | grep com.apple.quarantine`, (error) => {
      resolve(error ? false : true); // If error, command failed, so no quarantine attribute
    });
  });
};

/**
 * Fixes permissions for an executable file
 * @param {string} filePath Path to the file to fix
 * @returns {Promise<boolean>} True if successful
 */
const fixFilePermissions = (filePath) => {
  return new Promise((resolve) => {
    if (!isMacOS()) {
      resolve(true);
      return;
    }

    exec(`chmod +x "${filePath}"`, (error) => {
      if (error) {
        console.error(`Failed to set executable permissions for ${filePath}:`, error);
        resolve(false);
      } else {
        console.log(`Set executable permissions for ${filePath}`);
        resolve(true);
      }
    });
  });
};

/**
 * Removes quarantine attribute from a file
 * @param {string} filePath Path to the file
 * @returns {Promise<boolean>} True if successful
 */
const removeQuarantine = (filePath) => {
  return new Promise((resolve) => {
    if (!isMacOS()) {
      resolve(true);
      return;
    }

    exec(`xattr -d com.apple.quarantine "${filePath}"`, (error) => {
      if (error && error.code !== 1) { // Code 1 means attribute doesn't exist, which is fine
        console.error(`Failed to remove quarantine attribute for ${filePath}:`, error);
        resolve(false);
      } else {
        console.log(`Removed quarantine attribute for ${filePath}`);
        resolve(true);
      }
    });
  });
};

/**
 * Copies the executable to a trusted location (user's Application Support)
 * @param {string} fileName Name of the executable file
 * @returns {Promise<string>} Path to the copied file
 */
const copyToTrustedLocation = async (fileName) => {
  if (!isMacOS()) {
    return null;
  }

  const cs = new CSInterface();
  const homeDir = cs.getSystemPath(CSInterface.SystemPath.USER_DATA);
  const appSupportDir = path.join(homeDir, 'Library', 'Application Support', 'YoutubetoPremiere');
  const sourceFile = path.join(getExecDir(), fileName);
  const targetFile = path.join(appSupportDir, fileName);

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(appSupportDir)) {
      fs.mkdirSync(appSupportDir, { recursive: true });
    }

    // Copy the file
    fs.copyFileSync(sourceFile, targetFile);
    
    // Fix permissions on the copied file
    await fixFilePermissions(targetFile);
    await removeQuarantine(targetFile);
    
    console.log(`Copied ${fileName} to trusted location: ${targetFile}`);
    return targetFile;
  } catch (error) {
    console.error(`Failed to copy ${fileName} to trusted location:`, error);
    return null;
  }
};

/**
 * Shows a permissions dialog to the user
 * @param {string} message The message to show
 * @returns {Promise<boolean>} True if the user approved
 */
const showPermissionsDialog = (message) => {
  return new Promise((resolve) => {
    if (!isMacOS()) {
      resolve(true);
      return;
    }

    // Using AppleScript to show a dialog
    const script = `osascript -e 'tell app "Adobe Premiere Pro" to display dialog "${message}" buttons {"Cancel", "Allow"} default button "Allow"'`;
    
    exec(script, (error, stdout) => {
      if (error) {
        console.error('Dialog error:', error);
        resolve(false);
      } else {
        resolve(stdout.includes('Allow'));
      }
    });
  });
};

/**
 * Fixes permissions for all executables in the extension
 * @param {boolean} skipDialog Set to true to skip the permission dialog
 * @returns {Promise<boolean>} True if all executables were fixed
 */
const fixAllExecutables = async (skipDialog = false) => {
  if (!isMacOS()) {
    return true;
  }

  try {
    const executables = await getExecutables();
    let needsFix = false;

    // Check if any executable needs fixing
    for (const exePath of executables) {
      if (!fs.existsSync(exePath)) continue;
      
      const isQuarantined = await isFileQuarantined(exePath);
      if (isQuarantined) {
        needsFix = true;
        break;
      }
    }

    // If nothing needs fixing, we're done
    if (!needsFix) {
      console.log('All executables have proper permissions');
      return true;
    }

    // Show dialog if needed
    if (!skipDialog) {
      const approved = await showPermissionsDialog(
        "YoutubetoPremiere needs to fix permissions for its executables. " +
        "This is required for the extension to function properly on macOS."
      );
      
      if (!approved) {
        console.log('User declined permission fix');
        return false;
      }
    }

    // Fix all executables
    let allFixed = true;
    for (const exePath of executables) {
      if (!fs.existsSync(exePath)) continue;
      
      const permFixed = await fixFilePermissions(exePath);
      const quarantineRemoved = await removeQuarantine(exePath);
      
      if (!permFixed || !quarantineRemoved) {
        allFixed = false;
      }
    }

    return allFixed;
  } catch (error) {
    console.error('Failed to fix executable permissions:', error);
    return false;
  }
};

/**
 * Prepares a macOS executable for running by:
 * 1. Fixing permissions
 * 2. Removing quarantine
 * 3. Optionally copying to a trusted location
 * 
 * @param {string} fileName Name of the executable file
 * @param {boolean} copyToTrusted Whether to copy to a trusted location
 * @returns {Promise<string>} Path to the executable to use
 */
const prepareExecutable = async (fileName, copyToTrusted = false) => {
  if (!isMacOS()) {
    return path.join(getExecDir(), fileName);
  }

  try {
    const originalPath = path.join(getExecDir(), fileName);
    
    // Fix permissions on the original file
    await fixFilePermissions(originalPath);
    await removeQuarantine(originalPath);
    
    // Copy to trusted location if requested
    if (copyToTrusted) {
      const trustedPath = await copyToTrustedLocation(fileName);
      return trustedPath || originalPath;
    }
    
    return originalPath;
  } catch (error) {
    console.error(`Failed to prepare executable ${fileName}:`, error);
    return path.join(getExecDir(), fileName);
  }
};

/**
 * Finds FFmpeg on the system or uses the bundled one
 * @returns {Promise<string>} Path to FFmpeg
 */
const findAndPrepareFfmpeg = async () => {
  if (!isMacOS()) {
    return null;
  }

  try {
    const execDir = getExecDir();
    const bundledFfmpeg = path.join(execDir, 'ffmpeg');
    
    // First, try to fix the bundled ffmpeg
    if (fs.existsSync(bundledFfmpeg)) {
      await fixFilePermissions(bundledFfmpeg);
      await removeQuarantine(bundledFfmpeg);
      console.log('Using bundled ffmpeg with fixed permissions');
      return bundledFfmpeg;
    }
    
    // If bundled doesn't exist, look for system ffmpeg
    const commonPaths = [
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',
      path.join(process.env.HOME, 'bin', 'ffmpeg')
    ];
    
    // Create a file to store the ffmpeg path
    const ffmpegPathFile = path.join(execDir, 'ffmpeg_path.txt');
    
    // Check common paths
    for (const ffmpegPath of commonPaths) {
      if (fs.existsSync(ffmpegPath)) {
        console.log(`Found system ffmpeg at: ${ffmpegPath}`);
        fs.writeFileSync(ffmpegPathFile, ffmpegPath);
        return ffmpegPath;
      }
    }
    
    // Try to find using which command
    return new Promise((resolve) => {
      exec('which ffmpeg', (error, stdout) => {
        if (!error && stdout.trim()) {
          const ffmpegPath = stdout.trim();
          console.log(`Found ffmpeg using which: ${ffmpegPath}`);
          fs.writeFileSync(ffmpegPathFile, ffmpegPath);
          resolve(ffmpegPath);
        } else {
          console.warn('FFmpeg not found in system. Please install it using Homebrew: brew install ffmpeg');
          
          // Create a notification to inform the user
          exec(`osascript -e 'display notification "FFmpeg not found. Please install it using Homebrew: brew install ffmpeg" with title "YoutubetoPremiere"'`);
          
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('Error finding ffmpeg:', error);
    return null;
  }
};

module.exports = {
  isMacOS,
  fixAllExecutables,
  prepareExecutable,
  removeQuarantine,
  fixFilePermissions,
  copyToTrustedLocation,
  findAndPrepareFfmpeg
}; 