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

    // ---- crash-safety helpers (Premiere 26.x on macOS) -----------------------
    // Collect every nodeId in a container and all its sub-bins into `set`.
    $._ext.collectNodeIds = function(container, set) {
        if (!container || !container.children) return set;
        for (var i = 0; i < container.children.numItems; i++) {
            try {
                var it = container.children[i];
                if (!it) continue;
                if (it.nodeId) set[it.nodeId] = true;
                if (it.type === 2) $._ext.collectNodeIds(it, set);
            } catch (e) {}
        }
        return set;
    };

    // Same file on disk? Case-insensitive: default macOS and Windows volumes are.
    $._ext.samePath = function(a, b) {
        if (!a || !b) return false;
        try {
            return new File(a).fsName.toLowerCase() === new File(b).fsName.toLowerCase();
        } catch (e) {
            return false;
        }
    };

    // Find the item for mediaPath under container (recursively). Prefer one that
    // did not exist before the import; otherwise any item for that file.
    $._ext.findImportedItem = function(container, mediaPath, beforeIds) {
        var fresh = null, existing = null;
        var walk = function(c) {
            if (!c || !c.children) return;
            for (var i = 0; i < c.children.numItems; i++) {
                try {
                    var it = c.children[i];
                    if (!it) continue;
                    if (it.type === 2) { walk(it); continue; }
                    var p = null;
                    try { p = it.getMediaPath(); } catch (e) {}
                    if (!$._ext.samePath(p, mediaPath)) continue;
                    if (!beforeIds[it.nodeId]) { fresh = it; } else if (!existing) { existing = it; }
                } catch (e) {}
            }
        };
        walk(container);
        return fresh || existing;
    };

    // openProjectItem() must only ever receive a real clip/file ProjectItem.
    $._ext.isUsableProjectItem = function(it) {
        try {
            return !!it && typeof it === 'object' && !!it.nodeId && it.type !== 2 && it.type !== 3;
        } catch (e) {
            return false;
        }
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

            // Snapshot every item in the WHOLE project, not only the target bin:
            // Premiere can file the import elsewhere (reproduced when the same file
            // is imported twice concurrently), and a diff over one bin then finds
            // nothing at all.
            var beforeIds = $._ext.collectNodeIds(rootItem, {});

            // importFiles() returns a BOOLEAN ("true if successful, false if not"),
            // not an array of ProjectItems - measured on 26.3.2: typeof "boolean",
            // [0] undefined, .length undefined. The old code indexed it as an
            // array, so its fallback handed `undefined` to openProjectItem().
            safeDebug("Importing file...");
            var importOk = project.importFiles([normalizedPath],
                false,             // suppressUI
                targetBin,         // parentBin
                false              // importAsNumberedStills
            );
            safeDebug("importFiles returned: " + importOk);
            if (importOk === false) {
                return {
                    success: false,
                    error: "Premiere refused to import the file",
                    path: videoPath
                };
            }

            var importedItem = $._ext.findImportedItem(targetBin, normalizedPath, beforeIds)
                            || $._ext.findImportedItem(rootItem, normalizedPath, beforeIds);
            var projectItemId = null;
            try { projectItemId = importedItem ? importedItem.nodeId : null; } catch (e) {}
            safeDebug("Imported item: " + (importedItem ? importedItem.name : "(not found)"));

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

                // openProjectItem() with an invalid argument does NOT throw: Premiere
                // runs its own signal handler, then dvacore::config::Abort() -> abort(),
                // and the whole application dies (main-thread stack through
                // SL::SourceMonitorLiveObject::DVAOpenProjectItem; reproduced with
                // openProjectItem(null)). This was the Mac crash during downloads.
                // Only ever pass a validated ProjectItem; otherwise skip the monitor.
                if (!$._ext.isUsableProjectItem(importedItem)) {
                    safeDebug("No usable ProjectItem - Source Monitor not opened");
                    return {
                        success: true,
                        path: normalizedPath,
                        projectItem: projectItemId,
                        sourceMonitorError: "Imported item not found; Source Monitor not opened"
                    };
                }

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

