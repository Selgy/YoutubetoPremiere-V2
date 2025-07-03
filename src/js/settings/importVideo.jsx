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

    // Helper to get all item nodeIds from a bin
    $._ext.getAllNodeIds = function(container) {
        var ids = [];
        if (container && container.children && container.children.numItems > 0) {
            for (var i = 0; i < container.children.numItems; i++) {
                try {
                    var item = container.children[i];
                    if (item && item.nodeId) {
                        ids.push(item.nodeId);
                    }
                } catch (e) {
                    $._ext.debug("Error getting nodeId: " + e.toString());
                }
            }
        }
        return ids;
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
            var rootItem = project.rootItem;
            $._ext.debug("Project found");

            // Get the node IDs before import
            var beforeNodeIds = $._ext.getAllNodeIds(rootItem);
            $._ext.debug("Before import: " + beforeNodeIds.length + " items");

            // Import the file
            $._ext.debug("Importing file...");
            var importedFiles = project.importFiles([normalizedPath], 
                false,             // suppressUI
                rootItem,          // parentBin
                false              // importAsNumberedStills
            );
            
            // Check if the import actually returned a valid item
            if (!importedFiles || importedFiles.length === 0) {
                $._ext.debug("Import failed - returned null or empty array");
                return { 
                    success: false, 
                    error: "Import returned null or empty array",
                    path: videoPath
                };
            }
            
            $._ext.debug("File imported successfully, waiting for project update...");
            
            // Wait briefly to ensure the items are updated in the project
            $.sleep(2000);
            
            // Get the node IDs after import
            var afterNodeIds = $._ext.getAllNodeIds(rootItem);
            $._ext.debug("After import: " + afterNodeIds.length + " items");
            
            // Find the new item(s)
            var newItems = [];
            var newItemIds = [];
            
            for (var i = 0; i < rootItem.children.numItems; i++) {
                var item = rootItem.children[i];
                var found = false;
                
                // Skip bins
                if (item.type === 2) { // BIN type
                    continue;
                }
                
                // Check if the item's nodeId is in the before list
                for (var j = 0; j < beforeNodeIds.length; j++) {
                    if (item.nodeId === beforeNodeIds[j]) {
                        found = true;
                        break;
                    }
                }
                
                // If not found in the before list, it's new
                if (!found) {
                    newItems.push(item);
                    newItemIds.push(item.nodeId);
                }
            }
            
            $._ext.debug("Found " + newItems.length + " new items");
            
            // If no new items were found, try to use the first imported item
            var importedItem = null;
            var projectItemId = null;
            
            if (newItems.length > 0) {
                importedItem = newItems[0];
                $._ext.debug("Using new item: " + importedItem.name);
            } else {
                importedItem = importedFiles[0];
                $._ext.debug("Using imported file reference: " + importedItem.name);
            }
            
            // Get the project item ID
            try {
                projectItemId = importedItem.nodeId;
                $._ext.debug("Project item ID: " + projectItemId);
            } catch(e) {
                $._ext.debug("Could not get project item ID: " + e.toString());
            }

            // Now try to open in source monitor
            try {
                $._ext.debug("Opening in Source Monitor...");
                
                // Make sure we have a source monitor
                if (!app.sourceMonitor) {
                    $._ext.debug("Source monitor not available");
                    return { 
                        success: true, // Import succeeded even if we can't open in source monitor
                        path: normalizedPath,
                        projectItem: projectItemId,
                        sourceMonitorError: "Source monitor not available"
                    };
                }
                
                // First make sure the current clip is closed
                try {
                    $._ext.debug("Closing any open clips in source monitor...");
                    app.sourceMonitor.closeAllClips();
                } catch(e) {
                    // Ignore errors when closing clip
                    $._ext.debug("Error closing clips: " + e.toString());
                }
                
                // Wait for source monitor to be ready
                $.sleep(2000);
                
                // Use the documented method app.sourceMonitor.openProjectItem()
                $._ext.debug("Opening project item in source monitor...");
                var result = app.sourceMonitor.openProjectItem(importedItem);
                $._ext.debug("openProjectItem result: " + result);
                
                // Done
                $._ext.debug("Import and source monitor operations complete");
                return { 
                    success: true,
                    path: normalizedPath,
                    projectItem: projectItemId
                };
            } catch(e) {
                $._ext.debug("Source monitor open failed: " + e.toString());
                // Return success anyway because the import succeeded
                return { 
                    success: true,
                    path: normalizedPath,
                    projectItem: projectItemId,
                    sourceMonitorError: e.toString()
                };
            }
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

    // Expose the function in the correct namespace for evalTS
    if (typeof $["com.youtubetoPremiereV2.cep"] === 'undefined') {
        $["com.youtubetoPremiereV2.cep"] = {};
    }
    
    // Expose the function for evalTS to find
    $["com.youtubetoPremiereV2.cep"].importVideoToSource = $._ext.importVideoToSource;

    $._ext.debug("importVideo.jsx initialization complete - function exposed");
})();

