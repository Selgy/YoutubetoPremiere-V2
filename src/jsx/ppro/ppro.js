"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importVideoToSource = exports.helloWorld = exports.qeDomFunction = exports.helloVoid = exports.helloObj = exports.helloArrayStr = exports.helloNum = exports.helloStr = exports.helloError = void 0;
var samples_1 = require("../utils/samples");
Object.defineProperty(exports, "helloVoid", { enumerable: true, get: function () { return samples_1.helloVoid; } });
Object.defineProperty(exports, "helloError", { enumerable: true, get: function () { return samples_1.helloError; } });
Object.defineProperty(exports, "helloStr", { enumerable: true, get: function () { return samples_1.helloStr; } });
Object.defineProperty(exports, "helloNum", { enumerable: true, get: function () { return samples_1.helloNum; } });
Object.defineProperty(exports, "helloArrayStr", { enumerable: true, get: function () { return samples_1.helloArrayStr; } });
Object.defineProperty(exports, "helloObj", { enumerable: true, get: function () { return samples_1.helloObj; } });
var qeDomFunction = function () {
    if (typeof qe === "undefined") {
        app.enableQE();
    }
    if (qe) {
        qe.name;
        qe.project.getVideoEffectByName("test");
    }
};
exports.qeDomFunction = qeDomFunction;
var helloWorld = function () {
    alert("Hello from Premiere Pro.");
};
exports.helloWorld = helloWorld;
// Helper function to normalize file paths
var normalizePath = function (path) {
    var f = new File(path);
    // Use fsName which automatically converts to OS-appropriate path format
    // No need to replace anything - fsName already handles platform differences
    return f.fsName;
};
// Helper function to check if file exists
var fileExists = function (path) {
    var f = new File(path);
    return f.exists;
};
// Helper to get all item nodeIds from a bin
var getAllNodeIds = function (container) {
    var ids = [];
    if (container && container.children && container.children.numItems > 0) {
        for (var i = 0; i < container.children.numItems; i++) {
            try {
                var item = container.children[i];
                if (item && item.nodeId) {
                    ids.push(item.nodeId);
                }
            }
            catch (e) {
                // Ignore errors getting nodeId
            }
        }
    }
    return ids;
};
// Main function to import a file and open it in the Source Monitor
var importVideoToSource = function (videoPath) {
    try {
        // Verify Premiere Pro environment
        //@ts-ignore - ExtendScript globals
        if (typeof app === 'undefined') {
            return {
                success: false,
                error: "Premiere Pro application not available",
                path: videoPath
            };
        }
        //@ts-ignore - ExtendScript globals
        if (!app.project) {
            return {
                success: false,
                error: "No active Premiere Pro project",
                path: videoPath
            };
        }
        // Use the functions from $._ext if available, otherwise fallback to local functions
        //@ts-ignore - ExtendScript globals
        var pathNormalizer = (typeof $._ext !== 'undefined' && $._ext.normalizePath) ? $._ext.normalizePath : normalizePath;
        //@ts-ignore - ExtendScript globals  
        var existsChecker = (typeof $._ext !== 'undefined' && $._ext.fileExists) ? $._ext.fileExists : fileExists;
        // Normalize the path and check if file exists
        var normalizedPath = pathNormalizer(videoPath);
        if (!existsChecker(normalizedPath)) {
            return {
                success: false,
                error: "Video file not found at path: " + normalizedPath,
                path: videoPath
            };
        }
        // Get the active Premiere project
        //@ts-ignore - ExtendScript globals
        var project = app.project;
        var rootItem = project.rootItem;
        // Use the getAllNodeIds function from $._ext if available, otherwise fallback to local function
        //@ts-ignore - ExtendScript globals
        var nodeIdsGetter = (typeof $._ext !== 'undefined' && $._ext.getAllNodeIds) ? $._ext.getAllNodeIds : getAllNodeIds;
        // Get the node IDs before import
        var beforeNodeIds = nodeIdsGetter(rootItem);
        // Import the file
        var importedFiles = project.importFiles([normalizedPath], false, // suppressUI
        rootItem, // parentBin
        false // importAsNumberedStills
        );
        // Check if the import actually returned a valid item
        if (!importedFiles || importedFiles.length === 0) {
            return {
                success: false,
                error: "Import returned null or empty array",
                path: videoPath
            };
        }
        // Wait briefly to ensure the items are updated in the project
        // Keep short to avoid blocking Mac main thread (watchdog triggers crash dialogs above ~1s)
        //@ts-ignore - ExtendScript global
        $.sleep(300);
        // Get the node IDs after import
        var afterNodeIds = nodeIdsGetter(rootItem);
        // Find the new item(s)
        var newItems = [];
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
            }
        }
        // If no new items were found, try to use the first imported item
        var importedItem = null;
        var projectItemId = null;
        if (newItems.length > 0) {
            importedItem = newItems[0];
        }
        else {
            importedItem = importedFiles[0];
        }
        // Get the project item ID
        try {
            projectItemId = importedItem.nodeId;
        }
        catch (e) {
            // Could not get project item ID
        }
        // Now try to open in source monitor
        try {
            // Make sure we have a source monitor
            //@ts-ignore - ExtendScript globals
            if (!app.sourceMonitor) {
                return {
                    success: true, // Import succeeded even if we can't open in source monitor
                    path: normalizedPath,
                    projectItem: projectItemId,
                    sourceMonitorError: "Source monitor not available"
                };
            }
            // Wait for source monitor to be ready
            // Short sleep - Mac CEP bridge 200ms grace period in JS handles response timing
            //@ts-ignore - ExtendScript global
            $.sleep(200);
            // Use the documented method app.sourceMonitor.openProjectItem()
            //@ts-ignore - ExtendScript globals
            var result = app.sourceMonitor.openProjectItem(importedItem);
            // Done
            return {
                success: true,
                path: normalizedPath,
                projectItem: projectItemId
            };
        }
        catch (e) {
            // Return success anyway because the import succeeded
            return {
                success: true,
                path: normalizedPath,
                projectItem: projectItemId,
                sourceMonitorError: String(e)
            };
        }
    }
    catch (e) {
        return {
            success: false,
            error: String(e),
            path: videoPath
        };
    }
};
exports.importVideoToSource = importVideoToSource;
