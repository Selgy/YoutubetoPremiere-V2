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

    try {
      // Get extension directory
      const extensionPath = this.getExtensionPath();
      const appPath = `${extensionPath}/exec/YoutubeToPremiere.exe`;
      
      console.log('Starting app from:', appPath);

      // Check if file exists
      if (!this.fileExists(appPath)) {
        console.error('App executable not found:', appPath);
        return false;
      }

      // Start the application using CEP's process API
      const result = window.cep.process.createProcess(appPath, '', '');
      
      if (result.err === 0) {
        this.appProcess = result.data;
        this.isAppRunning = true;
        console.log('App started successfully with PID:', this.appProcess);
        return true;
      } else {
        console.error('Failed to start app:', result.err);
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
  async waitForServer(maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch('http://localhost:3002/health');
        if (response.ok) {
          console.log('Server is ready!');
          return true;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      // Wait 1 second before next attempt
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.error('Server failed to start within timeout');
    return false;
  }
} 