import { useEffect } from 'react';

const Main = () => {
  useEffect(() => {
    const startYoutubeToPremiereServer = async () => {
      try {
        // Get the extension path
        const extensionPath = await window.cep.fs.getSystemPath('extension');
        const execPath = `${extensionPath}/exec/YoutubetoPremiere.exe`;

        // Use CEP's system.openURLInDefaultBrowser to execute the file
        // We use "file://" protocol to execute the local file
        window.cep.process.createProcess(execPath, "");

      } catch (error) {
        console.error('Error starting YoutubetoPremiere:', error);
      }
    };

    startYoutubeToPremiereServer();

    // Cleanup on unmount
    return () => {
      // Optional: Add cleanup code here if needed
      // You might want to implement a way to gracefully shut down the server
    };
  }, []);

  return (
    <div>
      <h1 style={{ color: "#ff5b3b" }}>Welcome to YoutubetoPremiere!</h1>
    </div>
  );
};

export default Main;