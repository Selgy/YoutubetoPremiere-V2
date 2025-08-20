"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.join = exports.indexOf = exports.includes = exports.filter = exports.map = exports.forEach = exports.dispatchTS = void 0;
var shared_1 = require("../../shared/shared");
/**
 * @function dispatchTS Displatches an event to the CEP panel with Type-Safety
 * See listenTS() in the CEP panel for more info
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 */
var dispatchTS = function (event, data) {
    if (new ExternalObject("lib:PlugPlugExternalObject")) {
        var eventObj = new CSXSEvent();
        eventObj.type = "".concat(shared_1.ns, ".").concat(event);
        eventObj.data = JSON.stringify(data);
        eventObj.dispatch();
    }
};
exports.dispatchTS = dispatchTS;
var forEach = function (arr, callback) {
    for (var i = 0; i < arr.length; i++) {
        callback(arr[i], i);
    }
};
exports.forEach = forEach;
var map = function (arr, callback) {
    var res = [];
    for (var i = 0; i < arr.length; i++) {
        res.push(callback(arr[i], i));
    }
    return res;
};
exports.map = map;
var filter = function (arr, func) {
    var res = [];
    for (var i = 0; i < arr.length; i++) {
        if (func(arr[i], i)) {
            res.push(arr[i]);
        }
    }
    return res;
};
exports.filter = filter;
var includes = function (arr, value) {
    for (var i = 0; i < arr.length; i++) {
        var element = arr[i];
        if (element === value) {
            return true;
        }
    }
    return false;
};
exports.includes = includes;
var indexOf = function (arr, value) {
    for (var i = 0; i < arr.length; i++) {
        var element = arr[i];
        if (element === value) {
            return i;
        }
    }
    return -1;
};
exports.indexOf = indexOf;
// Joins paths
var join = function () {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    var sep = $.os === "Windows" ? "\\" : "/";
    var len = args.length;
    var res = args[0];
    for (var i = 1; i < len; i++) {
        res = res + sep + args[i];
    }
    return res;
};
exports.join = join;
