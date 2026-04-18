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
var importVideoToSource = function (videoPath, binPath) {
    if (binPath === void 0) { binPath = ''; }
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
        // Resolve target bin — supports nested paths like "Youtube/CLIP"
        var targetBin = rootItem;
        if (binPath && binPath.trim()) {
            var parts = binPath.split('/');
            var currentBin = rootItem;
            for (var p = 0; p < parts.length; p++) {
                var part = parts[p].trim();
                if (!part) continue;
                var foundBin = null;
                for (var c = 0; c < currentBin.children.numItems; c++) {
                    var child = currentBin.children[c];
                    if (child.type === 2 && child.name === part) { // 2 = BIN
                        foundBin = child;
                        break;
                    }
                }
                if (foundBin) {
                    currentBin = foundBin;
                } else {
                    try {
                        currentBin = currentBin.createBin(part);
                    } catch(binErr) {
                        break; // fall back to current level
                    }
                }
            }
            targetBin = currentBin;
        }
        // Use the getAllNodeIds function from $._ext if available, otherwise fallback to local function
        //@ts-ignore - ExtendScript globals
        var nodeIdsGetter = (typeof $._ext !== 'undefined' && $._ext.getAllNodeIds) ? $._ext.getAllNodeIds : getAllNodeIds;
        // Get the node IDs before import (in targetBin)
        var beforeNodeIds = nodeIdsGetter(targetBin);
        // Import the file into the target bin
        var importedFiles = project.importFiles([normalizedPath], false, // suppressUI
        targetBin, // parentBin — root or named bin
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
        // NOTE: No $.sleep() here. importFiles() is synchronous in ExtendScript —
        // the project is already updated when it returns. $.sleep() blocks Premiere Pro's
        // main thread and triggers Mac OS watchdog crash report dialogs.
        // Get the node IDs after import (in targetBin)
        var afterNodeIds = nodeIdsGetter(targetBin);
        // Find the new item(s)
        var newItems = [];
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
            // No $.sleep() before openProjectItem() — it blocks Premiere Pro's main
            // thread on Mac and causes OS watchdog crash reports. importFiles() is
            // synchronous so the item is already available when we reach this point.
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
