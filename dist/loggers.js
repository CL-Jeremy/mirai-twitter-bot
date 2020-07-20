"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const log4js_1 = require("log4js");
const loggers = [];
function getLogger(category) {
    const l = log4js_1.getLogger(category);
    l.level = 'info';
    loggers.push(l);
    return l;
}
exports.getLogger = getLogger;
function setLogLevels(level) {
    loggers.forEach((l) => l.level = (level !== null && level !== void 0 ? level : 'info'));
}
exports.setLogLevels = setLogLevels;
