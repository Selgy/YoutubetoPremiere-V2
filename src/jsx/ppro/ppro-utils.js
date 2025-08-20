"use strict";
// ProjectItem Helpers
Object.defineProperty(exports, "__esModule", { value: true });
exports.decToDb = exports.dbToDec = exports.fillMogrtText = exports.removePrMetadata = exports.setPrMetadata = exports.getPrMetadata = exports.qeSafeTimeDisplayFormat = exports.qeGetClipAt = exports.getTimecodeFromSequence = exports.getTimecode = exports.secondsToTime = exports.timecodeToTicks = exports.timecodeToSeconds = exports.ticksToFrames = exports.getFPSTime = exports.getItemDuration = exports.getItemFrameRate = exports.ticksToTime = exports.divideTime = exports.multiplyTime = exports.subtractTime = exports.addTime = exports.forEachClip = exports.forEachAudioTrack = exports.forEachVideoTrack = exports.getSequenceLengthInFrames = exports.getSequenceFromProjectItem = exports.findItemByPath = exports.getParentItem = exports.getDescendantByNodeId = exports.getChildFromTreePath = exports.getChildByNodeId = exports.getChildByName = exports.deleteItem = exports.forEachChild = void 0;
var forEachChild = function (item, callback) {
    var len = item.children.numItems;
    for (var i = 0; i < len; i++) {
        callback(item.children[i]);
    }
};
exports.forEachChild = forEachChild;
var deleteItem = function (item) {
    if (item.type === 2 /* BIN */) {
        item.deleteBin();
    }
    else {
        var tmpBin = app.project.rootItem.createBin("tmp");
        item.moveBin(tmpBin);
        tmpBin.deleteBin();
    }
};
exports.deleteItem = deleteItem;
var getChildByName = function (item, name) {
    for (var i = 0; i < item.children.numItems; i++) {
        var child = item.children[i];
        if (child.name === name) {
            return child;
        }
    }
};
exports.getChildByName = getChildByName;
var getChildByNodeId = function (item, nodeId) {
    for (var i = 0; i < item.children.numItems; i++) {
        var child = item.children[i];
        if (child.nodeId === nodeId) {
            return child;
        }
    }
};
exports.getChildByNodeId = getChildByNodeId;
var getChildFromTreePath = function (project, treePath) {
    var elements = treePath.split("\\"); // first item is blank, second is root
    var projectItem = project.rootItem;
    for (var i = 2; i < elements.length; i++) {
        var item = elements[i];
        projectItem = (0, exports.getChildByName)(projectItem, item);
        if (!projectItem)
            return null;
    }
    return projectItem;
};
exports.getChildFromTreePath = getChildFromTreePath;
var getDescendantByNodeId = function (item, nodeId) {
    for (var i = 0; i < item.children.numItems; i++) {
        var child = item.children[i];
        if (child.nodeId === nodeId) {
            return child;
        }
        else if (child.type === 2 /* BIN */) {
            var found = (0, exports.getDescendantByNodeId)(child, nodeId);
            if (found)
                return found;
        }
    }
};
exports.getDescendantByNodeId = getDescendantByNodeId;
var getParentItem = function (item) {
    var dir = item.treePath.split("\\");
    if (dir.length < 2) {
        return app.project.rootItem;
    }
    var current = app.project.rootItem;
    for (var i = 2; i < dir.length - 1; i++) {
        var name = dir[i];
        var next = (0, exports.getChildByName)(current, name);
        if (next) {
            current = next;
        }
    }
    return current;
};
exports.getParentItem = getParentItem;
var findItemByPath = function (item, path) {
    var len = item.children.numItems;
    for (var i = 0; i < len; i++) {
        var child = item.children[i];
        if (child.children && child.children.numItems > 0) {
            var res = (0, exports.findItemByPath)(child, path);
            if (res) {
                return res;
            }
        }
        else if (child.getMediaPath() === path) {
            return child;
        }
    }
};
exports.findItemByPath = findItemByPath;
// Sequence Helpers
var getSequenceFromProjectItem = function (item) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var seq = app.project.sequences[i];
        if (seq.projectItem.nodeId === item.nodeId) {
            return seq;
        }
    }
};
exports.getSequenceFromProjectItem = getSequenceFromProjectItem;
var getSequenceLengthInFrames = function (seq) {
    var settings = seq.getSettings();
    var end = seq.end;
    var fps = settings.videoFrameRate.ticks;
    var frames = parseInt(end) / parseInt(fps);
    return frames;
};
exports.getSequenceLengthInFrames = getSequenceLengthInFrames;
var forEachVideoTrack = function (sequence, callback, reverse) {
    var num = sequence.videoTracks.numTracks;
    if (reverse) {
        for (var i = num - 1; i > -1; i--) {
            callback(sequence.videoTracks[i], i);
        }
    }
    else {
        for (var i = 0; i < num; i++) {
            callback(sequence.videoTracks[i], i);
        }
    }
};
exports.forEachVideoTrack = forEachVideoTrack;
var forEachAudioTrack = function (sequence, callback, reverse) {
    var num = sequence.audioTracks.numTracks;
    if (reverse) {
        for (var i = num - 1; i > -1; i--) {
            callback(sequence.audioTracks[i], i);
        }
    }
    else {
        for (var i = 0; i < num; i++) {
            callback(sequence.audioTracks[i], i);
        }
    }
};
exports.forEachAudioTrack = forEachAudioTrack;
var forEachClip = function (track, callback, reverse) {
    var num = track.clips.numItems;
    if (reverse) {
        for (var i = num - 1; i > -1; i--) {
            callback(track.clips[i], i);
        }
    }
    else {
        for (var i = 0; i < num; i++) {
            callback(track.clips[i], i);
        }
    }
};
exports.forEachClip = forEachClip;
// Time Helpers
var addTime = function (a, b) {
    var ticks = parseInt(a.ticks) + parseInt(b.ticks);
    var time = new Time();
    time.ticks = ticks.toString();
    return time;
};
exports.addTime = addTime;
var subtractTime = function (a, b) {
    var ticks = parseInt(a.ticks) - parseInt(b.ticks);
    var time = new Time();
    time.ticks = ticks.toString();
    return time;
};
exports.subtractTime = subtractTime;
var multiplyTime = function (a, factor) {
    var ticks = parseInt(a.ticks) * factor;
    var time = new Time();
    time.ticks = ticks.toString();
    return time;
};
exports.multiplyTime = multiplyTime;
var divideTime = function (a, factor) {
    var ticks = parseInt(a.ticks) / factor;
    var time = new Time();
    time.ticks = ticks.toString();
    return time;
};
exports.divideTime = divideTime;
var ticksToTime = function (ticks) {
    var time = new Time();
    time.ticks = ticks;
    return time;
};
exports.ticksToTime = ticksToTime;
var fpsTicksTable = {
    23.976: 10594584000,
    24: 10584000000,
    25: 10160640000,
    29.97: 8475667200,
    30: 8467200000,
    50: 5080320000,
    59.94: 4237833600,
    60: 4233600000,
};
var getItemFrameRate = function (item) {
    if (item.isSequence()) {
        var sequence = (0, exports.getSequenceFromProjectItem)(item);
        if (sequence) {
            return 1 / sequence.getSettings().videoFrameRate.seconds;
        }
    }
    else {
        var key = "Column.Intrinsic.MediaTimebase";
        var mediaTimeBase = (0, exports.getPrMetadata)(item, [key]);
        return parseFloat(mediaTimeBase[key]);
    }
};
exports.getItemFrameRate = getItemFrameRate;
var getItemDuration = function (item) {
    var key = "Column.Intrinsic.MediaDuration";
    var res = (0, exports.getPrMetadata)(item, [key]);
    return parseFloat(res[key]);
};
exports.getItemDuration = getItemDuration;
var getFPSTime = function (fps) {
    var time = new Time();
    var ticks = fpsTicksTable[fps];
    if (!ticks)
        return false;
    time.ticks = ticks.toString();
    return time;
};
exports.getFPSTime = getFPSTime;
var ticksToFrames = function (ticks, timebase) {
    var timebaseNum = parseInt(timebase);
    return parseInt(ticks) / timebaseNum;
};
exports.ticksToFrames = ticksToFrames;
var timecodeToSeconds = function (timecode, frameRate) {
    var segments = timecode.split(":");
    var hours = parseInt(segments[0]);
    var minutes = parseInt(segments[1]);
    var seconds = parseInt(segments[2]);
    var frames = parseInt(segments[3]);
    return hours * 3600 + minutes * 60 + seconds + frames / frameRate;
};
exports.timecodeToSeconds = timecodeToSeconds;
var timecodeToTicks = function (timecode, frameRate) {
    var segments = timecode.split(":");
    var hours = parseInt(segments[0]);
    var minutes = parseInt(segments[1]);
    var seconds = parseInt(segments[2]);
    var frames = parseInt(segments[3]);
    var totalSeconds = hours * 3600 + minutes * 60 + seconds + frames / frameRate;
    var ticks = totalSeconds * 10000000; // 1 second = 10,000,000 ticks
    return Math.round(ticks);
};
exports.timecodeToTicks = timecodeToTicks;
var secondsToTime = function (seconds) {
    var time = new Time();
    time.seconds = seconds;
    return time;
};
exports.secondsToTime = secondsToTime;
var getTimecode = function (t, frameRateTime, videoDisplayFormat) {
    var timecode = t.getFormatted(frameRateTime, videoDisplayFormat);
    return timecode;
};
exports.getTimecode = getTimecode;
var getTimecodeFromSequence = function (t, sequence) {
    return (0, exports.getTimecode)(t, sequence.getSettings().videoFrameRate, sequence.getSettings().videoDisplayFormat);
};
exports.getTimecodeFromSequence = getTimecodeFromSequence;
// QE DOM Methods
var qeGetClipAt = function (track, index) {
    var curClipIndex = -1;
    for (var i = 0; i < track.numItems; i++) {
        var item = track.getItemAt(i);
        //@ts-ignore
        var type = item.type;
        if (type === "Clip") {
            curClipIndex++;
            if (curClipIndex === index) {
                return item;
            }
        }
    }
};
exports.qeGetClipAt = qeGetClipAt;
// QE DOM doesn't understand some format, so this function so we convert to compatible ones
var qeSafeTimeDisplayFormat = function (timeDisplayFormat) {
    var conversionTable = {
        998: 110, // 23.89 > 23.976
    };
    var match = conversionTable[timeDisplayFormat];
    return match ? match : timeDisplayFormat;
};
exports.qeSafeTimeDisplayFormat = qeSafeTimeDisplayFormat;
// Metadata Helpers
var getPrMetadata = function (projectItem, fields) {
    var PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
    if (ExternalObject.AdobeXMPScript === undefined) {
        ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
        return {};
    }
    var xmp = new XMPMeta(projectItem.getProjectMetadata());
    var result = {};
    for (var i = 0; i < fields.length; i++) {
        if (xmp.doesPropertyExist(PProMetaURI, fields[i])) {
            result[fields[i]] = xmp.getProperty(PProMetaURI, fields[i]).value;
        }
    }
    return result;
};
exports.getPrMetadata = getPrMetadata;
var setPrMetadata = function (projectItem, data) {
    var PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
    if (ExternalObject.AdobeXMPScript === undefined) {
        ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
        return {};
    }
    var xmp = new XMPMeta(projectItem.getProjectMetadata());
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var successfullyAdded = app.project.addPropertyToProjectMetadataSchema(item.fieldName, item.fieldId, 2);
    }
    var array = [];
    for (var i = 0; i < data.length; i++) {
        var item = data[i];
        xmp.setProperty(PProMetaURI, item.fieldName, item.value);
        array.push(item.fieldName);
    }
    var str = xmp.serialize();
    projectItem.setProjectMetadata(str, array);
};
exports.setPrMetadata = setPrMetadata;
var removePrMetadata = function (projectItem, fields) {
    var PProMetaURI = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
    if (ExternalObject.AdobeXMPScript === undefined) {
        ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
    }
    if (!app.isDocumentOpen() || !ExternalObject.AdobeXMPScript || !XMPMeta) {
        return {};
    }
    var xmp = new XMPMeta(projectItem.getProjectMetadata());
    var array = [];
    for (var i = 0; i < fields.length; i++) {
        xmp.deleteProperty(PProMetaURI, fields[i]);
        array.push(fields[i]);
    }
    var str = xmp.serialize();
    projectItem.setProjectMetadata(str, array);
};
exports.removePrMetadata = removePrMetadata;
// Motion Graphics Template ( MOGRT ) Helpers
var fillMogrtText = function (clip, propName, text) {
    var mgt = clip.getMGTComponent();
    var prop = mgt.properties.getParamForDisplayName(propName);
    if (prop) {
        var valueStr = prop.getValue();
        var value = JSON.parse(valueStr);
        value.textEditValue = text;
        prop.setValue(JSON.stringify(value), true);
    }
};
exports.fillMogrtText = fillMogrtText;
// Audio Conversions
var dbToDec = function (x) { return Math.pow(10, (x - 15) / 20); };
exports.dbToDec = dbToDec;
var decToDb = function (x) { return 20 * Math.log(x) * Math.LOG10E + 15; };
exports.decToDb = decToDb;
