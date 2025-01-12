/* 
    Premiere Pro ExtendScript snippet:
    - Imports a video into the current project 
    - Opens it in the Source Monitor
    - No After Effects-specific calls (like new ImportOptions)
*/
(function() {
    // Initialize the ExtendScript environment
    if (typeof $ === 'undefined') {
        throw new Error('ExtendScript environment not initialized');
    }

    $.writeln("[DEBUG] Starting importVideo.jsx initialization");
    
    if (typeof $._ext === 'undefined') {
        $.writeln("[DEBUG] Creating $._ext namespace");
        $._ext = {};
    }

    // Simple logger for debugging
    $._ext.debug = function(message) {
        $.writeln("[DEBUG] " + message);
    };

    $._ext.debug("Initializing importVideoToSource function");

    // Main function to import a file and open it in the Source Monitor
    $._ext.importVideoToSource = function(videoPath) {
        try {
            $._ext.debug("Starting import for: " + videoPath);

            // Verify Premiere Pro environment
            if (typeof app === 'undefined' || !app.project) {
                throw new Error("Premiere Pro project not available");
            }

            // Get the active Premiere project
            var project = app.project;
            $._ext.debug("Project found.");

            // Import the file using Premiere's project.importFiles()
            $._ext.debug("Importing file...");
            var importedFile = project.importFiles(
                [videoPath],       // array of file paths
                false,             // suppressUI?
                project.rootItem,  // parent folder (bin)
                false              // importAsNumberedStills?
            );
            
            // Check if the import actually returned a valid item
            if (!importedFile || importedFile.length === 0) {
                throw new Error("Import returned null or empty array.");
            }
            $._ext.debug("File imported successfully.");

            // Attempt to open the newly imported item in the Source Monitor
            var success = false;
            try {
                $._ext.debug("Trying sourceMonitor access...");
                if (app && app.sourceMonitor) {
                    // Premiere's sourceMonitor is available
                    importedFile[0].openInSourceMonitor();
                    success = true;
                    $._ext.debug("Opened in Source Monitor via imported item.");
                } else {
                    throw new Error("Source monitor not available in this environment.");
                }
            } catch(e1) {
                // If the direct approach fails, try an alternate path-based approach
                $._ext.debug("Source monitor open failed: " + e1.toString());
                $._ext.debug("Trying fallback openFilePath() method...");
                try {
                    var fileObj = new File(videoPath);
                    if (!fileObj.exists) {
                        throw new Error("Video file not found at path: " + videoPath);
                    }
                    app.sourceMonitor.openFilePath(videoPath);
                    success = true;
                    $._ext.debug("Opened in Source Monitor via openFilePath().");
                } catch(e2) {
                    $._ext.debug("Fallback method failed: " + e2.toString());
                }
            }

            if (!success) {
                throw new Error("Failed to open file in the Source Monitor.");
            }

            $._ext.debug("Import and Source Monitor open complete.");
            return { success: true };
        } catch(e) {
            var errorMsg = "Error: " + e.toString();
            $._ext.debug(errorMsg);
            return { success: false, error: errorMsg };
        }
    };

    $._ext.debug("importVideo.jsx initialization complete");
})();
