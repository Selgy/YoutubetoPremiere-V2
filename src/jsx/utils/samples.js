"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helloObj = exports.helloArrayStr = exports.helloNum = exports.helloStr = exports.helloError = exports.helloVoid = void 0;
var helloVoid = function () {
    alert("test");
};
exports.helloVoid = helloVoid;
var helloError = function (str) {
    // Intentional Error for Error Handling Demonstration
    //@ts-ignore
    throw new Error("We're throwing an error");
};
exports.helloError = helloError;
var helloStr = function (str) {
    alert("ExtendScript received a string: ".concat(str));
    return str;
};
exports.helloStr = helloStr;
var helloNum = function (n) {
    alert("ExtendScript received a number: ".concat(n.toString()));
    return n;
};
exports.helloNum = helloNum;
var helloArrayStr = function (arr) {
    alert("ExtendScript received an array of ".concat(arr.length, " strings: ").concat(arr.toString()));
    return arr;
};
exports.helloArrayStr = helloArrayStr;
var helloObj = function (obj) {
    alert("ExtendScript received an object: ".concat(JSON.stringify(obj)));
    return {
        y: obj.height,
        x: obj.width,
    };
};
exports.helloObj = helloObj;
