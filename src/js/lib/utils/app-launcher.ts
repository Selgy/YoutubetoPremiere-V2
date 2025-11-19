import CSInterface from '../cep/csinterface';

declare const window: Window & {
  cep: any;
  __adobe_cep__: any;
};

export class AppLauncher {
  private static instance: AppLauncher;
  private appProcess: any = null;
  private isAppRunning = false;

  static getInstance(): AppLauncher {
    if (!AppLauncher.instance) {
      AppLauncher.instance = new AppLauncher();
    }
    return AppLauncher.instance;
  }

  /**
   * Start the Python application
   */
  async startApp(): Promise<boolean> {
    if (this.isAppRunning) {
      console.log('App is already running');
      return true;
    }

    // First check if server is already running (from another source)
    try {
      const response = await fetch('http://localhost:17845/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        console.log('Server already running, marking as started');
        this.isAppRunning = true;
        return true;
      }
    } catch (error) {
      console.log('Server not running, proceeding with startup');
    }

    try {
      // Get extension directory
      const extensionPath = this.getExtensionPath();
      
      // Detect platform and use correct executable name
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const executableName = isMac ? 'YoutubetoPremiere' : 'YoutubetoPremiere.exe';
      const appPath = `${extensionPath}/exec/${executableName}`;
      
      console.log('Platform:', isMac ? 'macOS' : 'Windows');
      console.log('Starting app from:', appPath);

      // Check if file exists
      if (!this.fileExists(appPath)) {
        console.error('App executable not found:', appPath);
        return false;
      }

      // For macOS, fix permissions before starting
      if (isMac) {
        try {
          console.log('Fixing macOS permissions and quarantine attributes...');
          const fixPermissionsResult = window.cep.process.createProcess('/bin/chmod', `+x "${appPath}"`, '');
          if (fixPermissionsResult.err !== 0) {
            console.warn('Failed to fix permissions:', fixPermissionsResult.err);
          }
          
          // Remove quarantine attribute
          const removeQuarantineResult = window.cep.process.createProcess('/usr/bin/xattr', `-dr com.apple.quarantine "${extensionPath}/exec"`, '');
          if (removeQuarantineResult.err !== 0) {
            console.warn('Failed to remove quarantine (this is normal):', removeQuarantineResult.err);
          }
        } catch (permError) {
          console.warn('Permission fixing failed:', permError);
        }
      }

      // Start the application using CEP's process API with better error handling
      console.log('Creating process with CEP API...');
      const result = window.cep.process.createProcess(appPath, '--verbose', '');
      
      if (result.err === 0) {
        this.appProcess = result.data;
        this.isAppRunning = true;
        console.log('App started successfully with PID:', this.appProcess);
        
        // Give the process a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return true;
      } else {
        console.error('Failed to start app with CEP API, error code:', result.err);
        
        // On macOS, try alternative launch method if CEP fails
        if (isMac) {
          console.log('Trying alternative macOS launch method...');
          try {
            // Use open command as fallback
            const openResult = window.cep.process.createProcess('/usr/bin/open', `-a "${appPath}"`, '');
            if (openResult.err === 0) {
              console.log('App started with open command');
              this.isAppRunning = true;
              await new Promise(resolve => setTimeout(resolve, 3000));
              return true;
            }
          } catch (openError) {
            console.error('Alternative launch method failed:', openError);
          }
        }
        
        return false;
      }
    } catch (error) {
      console.error('Error starting app:', error);
      return false;
    }
  }

  /**
   * Stop the Python application
   */
  async stopApp(): Promise<boolean> {
    if (!this.isAppRunning || !this.appProcess) {
      console.log('App is not running');
      return true;
    }

    try {
      // Terminate the process
      const result = window.cep.process.terminateProcess(this.appProcess);
      
      if (result.err === 0) {
        this.appProcess = null;
        this.isAppRunning = false;
        console.log('App stopped successfully');
        return true;
      } else {
        console.error('Failed to stop app:', result.err);
        return false;
      }
    } catch (error) {
      console.error('Error stopping app:', error);
      return false;
    }
  }

  /**
   * Check if app is running
   */
  isRunning(): boolean {
    return this.isAppRunning;
  }

  /**
   * Get the extension directory path
   */
  private getExtensionPath(): string {
    try {
      const csInterface = new CSInterface();
      return csInterface.getSystemPath('extension');
    } catch (error) {
      console.error('Error getting extension path:', error);
      return '';
    }
  }

  /**
   * Check if file exists
   */
  private fileExists(filePath: string): boolean {
    try {
      const result = window.cep.fs.stat(filePath);
      return result.err === 0;
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer(maxAttempts = 45): Promise<boolean> {
    console.log('Waiting for server to be ready...');
    let lastError = null;
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch('http://localhost:17845/health', {
          signal: controller.signal,
          method: 'GET'
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('Server is ready!');
          return true;
        } else {
          lastError = `Server responded with status: ${response.status}`;
        }
      } catch (error) {
        lastError = error;
        // Server not ready yet
      }
      
      // Log progress every 5 seconds or on first attempt
      if (i % 5 === 0 || i === 0) {
        console.log(`Waiting for server... (attempt ${i + 1}/${maxAttempts})`);
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.error('Server failed to start within timeout. Last error:', lastError);
    return false;
  }
} 