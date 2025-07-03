// ExtendScript global declarations
declare const app: any;
declare const alert: (message: string) => void;
declare const $: any;

import {
  helloVoid,
  helloError,
  helloStr,
  helloNum,
  helloArrayStr,
  helloObj,
} from "../utils/samples";
export { helloError, helloStr, helloNum, helloArrayStr, helloObj, helloVoid };
import { dispatchTS } from "../utils/utils";

export const qeDomFunction = () => {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (qe) {
    qe.name;
    qe.project.getVideoEffectByName("test");
  }
};

export const helloWorld = () => {
  alert("Hello from Premiere Pro.");
};

// Extend the $ type to include our custom _ext namespace
declare global {
  interface $ {
    _ext?: {
      importVideoToSource?: (videoPath: string) => any;
    };
  }
}

// Helper function to normalize file paths
const normalizePath = (path: string) => {
  var f = new File(path);
  return f.fsName.replace(/\\\\/g, '\\');
};

// Helper function to check if file exists
const fileExists = (path: string) => {
  var f = new File(path);
  return f.exists;
};

// Helper to get all item nodeIds from a bin
const getAllNodeIds = (container: any) => {
  var ids = [];
  if (container && container.children && container.children.numItems > 0) {
    for (var i = 0; i < container.children.numItems; i++) {
      try {
        var item = container.children[i];
        if (item && item.nodeId) {
          ids.push(item.nodeId);
        }
      } catch (e) {
        // Ignore errors getting nodeId
      }
    }
  }
  return ids;
};

// Main function to import a file and open it in the Source Monitor
export const importVideoToSource = (videoPath: string) => {
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

    // Normalize the path and check if file exists
    var normalizedPath = normalizePath(videoPath);
    
    if (!fileExists(normalizedPath)) {
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

    // Get the node IDs before import
    var beforeNodeIds = getAllNodeIds(rootItem);

    // Import the file
    var importedFiles = project.importFiles([normalizedPath], 
      false,             // suppressUI
      rootItem,          // parentBin
      false              // importAsNumberedStills
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
    //@ts-ignore - ExtendScript global
    $.sleep(2000);
    
    // Get the node IDs after import
    var afterNodeIds = getAllNodeIds(rootItem);
    
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
    } else {
      importedItem = importedFiles[0];
    }
    
    // Get the project item ID
    try {
      projectItemId = importedItem.nodeId;
    } catch(e) {
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
      
      // First make sure the current clip is closed
      try {
        //@ts-ignore - ExtendScript globals
        app.sourceMonitor.closeAllClips();
      } catch(e) {
        // Ignore errors when closing clip
      }
      
      // Wait for source monitor to be ready
      //@ts-ignore - ExtendScript global
      $.sleep(2000);
      
      // Use the documented method app.sourceMonitor.openProjectItem()
      //@ts-ignore - ExtendScript globals
      var result = app.sourceMonitor.openProjectItem(importedItem);
      
      // Done
      return {
        success: true,
        path: normalizedPath,
        projectItem: projectItemId
      };
    } catch(e) {
      // Return success anyway because the import succeeded
      return {
        success: true,
        path: normalizedPath,
        projectItem: projectItemId,
        sourceMonitorError: String(e)
      };
    }
  } catch(e) {
    return {
      success: false,
      error: String(e),
      path: videoPath
    };
  }
};
