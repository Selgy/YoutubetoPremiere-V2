function selectFolder() {
    try {
        var folder = Folder.selectDialog("Select Download Folder");
        if (folder) {
            return folder.fsName;
        }
        return "";
    } catch(e) {
        alert("Error: " + e);
        return "";
    }
} 