(function() {
    if (typeof $._ext === 'undefined') {
        $._ext = {};
    }

    $._ext.debug = function(message) {
        $.writeln(message);
    };

    $._ext.importVideoToSource = function(videoPath) {
        try {
            if (!app.project) {
                throw new Error("No active project found");
            }
            
            // Normalize path for Windows
            videoPath = videoPath.replace(/\\/g, '/');
            $._ext.debug("Attempting to import normalized path: " + videoPath);
            
            // Verify file exists and is accessible
            var importFile = new File(videoPath);
            if (!importFile.exists) {
                throw new Error("File does not exist: " + videoPath);
            }
            
            // Import the file with explicit error checking
            var importedFile;
            try {
                importedFile = app.project.importFiles([videoPath], 
                    false,  // suppress warnings
                    app.project.rootItem,  // parent folder
                    false   // import as numbered stills
                );
            } catch(importError) {
                $._ext.debug("Import error: " + importError.toString());
                throw new Error("Failed to import file: " + importError.toString());
            }
            
            if (!importedFile || importedFile.length === 0) {
                throw new Error("Import failed - no file imported");
            }

            $._ext.debug("File imported successfully");
            $.sleep(2000); // Increased delay to ensure Premiere has time to process
            
            // Try to open in source monitor with multiple attempts
            var maxAttempts = 3;
            for(var attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    $._ext.debug("Opening in source monitor (attempt " + attempt + ")");
                    importedFile[0].openInSource();
                    $.sleep(500);
                    return "true";
                } catch(e) {
                    if(attempt === maxAttempts) {
                        throw e;
                    }
                    $.sleep(1000);
                }
            }
        } catch(e) {
            var errorMsg = "Error: " + e.toString();
            $._ext.debug("Fatal error: " + errorMsg);
            return errorMsg;
        }
    };
}()); 