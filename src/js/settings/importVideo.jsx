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

    // Helper function to normalize file paths
    $._ext.normalizePath = function(path) {
        var f = new File(path);
        return f.fsName.replace(/\\\\/g, '\\');
    };

    // Helper function to check if file exists
    $._ext.fileExists = function(path) {
        var f = new File(path);
        return f.exists;
    };

    $._ext.debug("Initializing importVideoToSource function");

    // Main function to import a file and open it in the Source Monitor
    $._ext.importVideoToSource = function(videoPath) {
        try {
            $._ext.debug("Starting import for: " + videoPath);

            // Verify Premiere Pro environment
            if (typeof app === 'undefined') {
                return { 
                    success: false, 
                    error: "Premiere Pro application not available",
                    path: videoPath
                };
            }
            if (!app.project) {
                return { 
                    success: false, 
                    error: "No active Premiere Pro project",
                    path: videoPath
                };
            }

            // Normalize the path and check if file exists
            var normalizedPath = $._ext.normalizePath(videoPath);
            $._ext.debug("Normalized path: " + normalizedPath);
            
            if (!$._ext.fileExists(normalizedPath)) {
                return { 
                    success: false, 
                    error: "Video file not found at path: " + normalizedPath,
                    path: videoPath
                };
            }

            // Get the active Premiere project
            var project = app.project;
            $._ext.debug("Project found.");

            // Import the file using Premiere's project.importFiles()
            $._ext.debug("Importing file...");
            var importedFile = project.importFiles([normalizedPath], 
                false,             // suppressUI
                project.rootItem,  // parentBin
                false             // importAsNumberedStills
            );
            
            // Check if the import actually returned a valid item
            if (!importedFile || importedFile.length === 0) {
                return { 
                    success: false, 
                    error: "Import returned null or empty array",
                    path: videoPath
                };
            }
            $._ext.debug("File imported successfully");

            // Get the project item ID
            var projectItemId = null;
            try {
                projectItemId = importedFile[0].nodeId;
                $._ext.debug("Project item ID: " + projectItemId);
            } catch(e) {
                $._ext.debug("Could not get project item ID: " + e.toString());
            }

            // Attempt to open the newly imported item in the Source Monitor
            try {
                $._ext.debug("Trying sourceMonitor access...");
                if (app.sourceMonitor) {
                    importedFile[0].openInSourceMonitor();
                    $._ext.debug("Opened in Source Monitor via imported item");
                }
            } catch(e1) {
                $._ext.debug("Primary method failed: " + e1.toString());
                try {
                    $._ext.debug("Trying fallback method...");
                    app.sourceMonitor.openFilePath(normalizedPath);
                    $._ext.debug("Opened in Source Monitor via fallback method");
                } catch(e2) {
                    $._ext.debug("Fallback method failed: " + e2.toString());
                }
            }

            $._ext.debug("Import complete");
            return { 
                success: true,
                path: normalizedPath,
                projectItem: projectItemId
            };
        } catch(e) {
            var errorMsg = e.toString();
            $._ext.debug("Error: " + errorMsg);
            return { 
                success: false, 
                error: errorMsg,
                path: videoPath
            };
        }
    };

    // Remove the wrapper function since we're handling the object format directly
    $._ext.debug("importVideo.jsx initialization complete");
})();

