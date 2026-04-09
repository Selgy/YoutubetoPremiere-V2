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

    // Create a safe debug function that always works
    var safeDebug = function(message) {
        try {
            $.writeln("[DEBUG] " + message);
        } catch(e) {
            // Silent fallback if $.writeln fails
        }
    };

    safeDebug("Starting importVideo.jsx initialization");
    
    if (typeof $._ext === 'undefined') {
        safeDebug("Creating $._ext namespace");
        $._ext = {};
    }

    // Simple logger for debugging with fallback
    $._ext.debug = safeDebug;

    // Helper function to normalize file paths
    $._ext.normalizePath = function(path) {
        var f = new File(path);
        // Use fsName which automatically converts to OS-appropriate path format
        // No need to replace anything - fsName already handles platform differences
        return f.fsName;
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
                    safeDebug("Error getting nodeId: " + e.toString());
                }
            }
        }
        return ids;
    };

    safeDebug("Initializing importVideoToSource function");

    // Main function to import a file and open it in the Source Monitor
    // Find an existing bin by name or create it under parentItem
    $._ext.findOrCreateBin = function(parentItem, binName) {
        for (var i = 0; i < parentItem.children.numItems; i++) {
            var child = parentItem.children[i];
            if (child.type === 2 && child.name === binName) {
                return child;
            }
        }
        return parentItem.createBin(binName);
    };

    // ExtendScript (ES3) does not have String.prototype.trim - polyfill it
    var trimStr = function(s) { return s.replace(/^\s+|\s+$/g, ''); };

    // Navigate/create nested bin path like "Youtube/CLIP" under rootItem
    $._ext.getTargetBin = function(rootItem, binPath) {
        if (!binPath || trimStr(binPath) === '') return rootItem;
        var parts = binPath.split('/');
        var current = rootItem;
        for (var i = 0; i < parts.length; i++) {
            var part = trimStr(parts[i]);
            if (part !== '') {
                current = $._ext.findOrCreateBin(current, part);
            }
        }
        return current;
    };

    $._ext.importVideoToSource = function(videoPath, binPath) {
        try {
            safeDebug("Starting import for: " + videoPath + " | bin: " + (binPath || '(root)'));

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
            safeDebug("Normalized path: " + normalizedPath);
            
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
            safeDebug("Project found");

            // Resolve target bin (creates subfolders if needed)
            var targetBin = $._ext.getTargetBin(rootItem, binPath || '');
            safeDebug("Target bin: " + targetBin.name);

            // Get the node IDs before import (from target bin)
            var beforeNodeIds = $._ext.getAllNodeIds(targetBin);
            safeDebug("Before import: " + beforeNodeIds.length + " items");

            // Import the file into target bin
            safeDebug("Importing file...");
            var importedFiles = project.importFiles([normalizedPath],
                false,             // suppressUI
                targetBin,         // parentBin
                false              // importAsNumberedStills
            );
            
            // Check if the import actually returned a valid item
            if (!importedFiles || importedFiles.length === 0) {
                safeDebug("Import failed - returned null or empty array");
                return { 
                    success: false, 
                    error: "Import returned null or empty array",
                    path: videoPath
                };
            }
            
            safeDebug("File imported successfully, waiting for project update...");
            
            // Wait briefly to ensure the items are updated in the project
            $.sleep(200);

            // Get the node IDs after import (from target bin)
            var afterNodeIds = $._ext.getAllNodeIds(targetBin);
            safeDebug("After import: " + afterNodeIds.length + " items");

            // Find the new item(s) in the target bin
            var newItems = [];
            var newItemIds = [];

            for (var i = 0; i < targetBin.children.numItems; i++) {
                var item = targetBin.children[i];
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
            
            safeDebug("Found " + newItems.length + " new items");
            
            // If no new items were found, try to use the first imported item
            var importedItem = null;
            var projectItemId = null;
            
            if (newItems.length > 0) {
                importedItem = newItems[0];
                safeDebug("Using new item: " + importedItem.name);
            } else {
                importedItem = importedFiles[0];
                safeDebug("Using imported file reference: " + importedItem.name);
            }
            
            // Get the project item ID
            try {
                projectItemId = importedItem.nodeId;
                safeDebug("Project item ID: " + projectItemId);
            } catch(e) {
                safeDebug("Could not get project item ID: " + e.toString());
            }

            // Now try to open in source monitor
            try {
                safeDebug("Opening in Source Monitor...");
                
                // Make sure we have a source monitor
                if (!app.sourceMonitor) {
                    safeDebug("Source monitor not available");
                    return { 
                        success: true, // Import succeeded even if we can't open in source monitor
                        path: normalizedPath,
                        projectItem: projectItemId,
                        sourceMonitorError: "Source monitor not available"
                    };
                }
                
                
                // Wait for source monitor to be ready
                $.sleep(200);
                
                // Use the documented method app.sourceMonitor.openProjectItem()
                safeDebug("Opening project item in source monitor...");
                var result = app.sourceMonitor.openProjectItem(importedItem);
                safeDebug("openProjectItem result: " + result);
                
                // Done
                safeDebug("Import and source monitor operations complete");
                return { 
                    success: true,
                    path: normalizedPath,
                    projectItem: projectItemId
                };
            } catch(e) {
                safeDebug("Source monitor open failed: " + e.toString());
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
            safeDebug("Error: " + errorMsg);
            return { 
                success: false, 
                error: errorMsg,
                path: videoPath
            };
        }
    };

    // Expose the function in the correct namespace for evalTS
    if (typeof $["com.selgy.youtubetopremiere"] === 'undefined') {
        $["com.selgy.youtubetopremiere"] = {};
    }
    
    // Expose the function for evalTS to find
    $["com.selgy.youtubetopremiere"].importVideoToSource = $._ext.importVideoToSource;
    
    // Also expose under the new namespace for compatibility
    if (typeof $["com.youtubetoPremiereV2.cep"] === 'undefined') {
        $["com.youtubetoPremiereV2.cep"] = {};
    }
    $["com.youtubetoPremiereV2.cep"].importVideoToSource = $._ext.importVideoToSource;

    safeDebug("importVideo.jsx initialization complete - function exposed");
})();

