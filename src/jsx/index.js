"use strict";
// @include './lib/json2.js'
Object.defineProperty(exports, "__esModule", { value: true });
var shared_1 = require("../shared/shared");
var ppro = require("./ppro/ppro");
//@ts-ignore
var host = typeof $ !== "undefined" ? $ : window;
// A safe way to get the app name since some versions of Adobe Apps broken BridgeTalk in various places (e.g. After Effects 24-25)
// in that case we have to do various checks per app to deterimine the app name
var getAppNameSafely = function () {
    var compare = function (a, b) {
        return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
    };
    var exists = function (a) { return typeof a !== "undefined"; };
    var isBridgeTalkWorking = typeof BridgeTalk !== "undefined" &&
        typeof BridgeTalk.appName !== "undefined";
    if (isBridgeTalkWorking) {
        return BridgeTalk.appName;
    }
    else if (app) {
        //@ts-ignore
        if (exists(app.name)) {
            //@ts-ignore
            var name = app.name;
            if (compare(name, "photoshop"))
                return "photoshop";
            if (compare(name, "illustrator"))
                return "illustrator";
            if (compare(name, "audition"))
                return "audition";
            if (compare(name, "bridge"))
                return "bridge";
            if (compare(name, "indesign"))
                return "indesign";
        }
        //@ts-ignore
        if (exists(app.appName)) {
            //@ts-ignore
            var appName = app.appName;
            if (compare(appName, "after effects"))
                return "aftereffects";
            if (compare(appName, "animate"))
                return "animate";
        }
        //@ts-ignore
        if (exists(app.path)) {
            //@ts-ignore
            var path = app.path;
            if (compare(path, "premiere"))
                return "premierepro";
        }
        //@ts-ignore
        if (exists(app.getEncoderHost) && exists(AMEFrontendEvent)) {
            return "ame";
        }
    }
    return "unknown";
};
switch (getAppNameSafely()) {
    case "premierepro":
    case "premiereprobeta":
        host[shared_1.ns] = ppro;
        break;
}
var empty = {};
