"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function default_1(message) {
    var _a, _b;
    message = message.trim();
    message = message.replace('\\\\', '\\0x5c');
    message = message.replace('\\\"', '\\0x22');
    message = message.replace('\\\'', '\\0x27');
    const strs = message.match(/'[\s\S]*?'|"[\s\S]*?"|\S*\[CQ:[\s\S]*?\]\S*|\S+/mg);
    const cmd = ((_a = strs) === null || _a === void 0 ? void 0 : _a.length) ? strs[0].length ? strs[0].substring(0, 1) === '/' ? strs[0].substring(1) : '' : '' : '';
    const args = (_b = strs) === null || _b === void 0 ? void 0 : _b.slice(1).map(arg => {
        arg = arg.replace(/^["']+|["']+$/g, '');
        arg = arg.replace('\\0x27', '\\\'');
        arg = arg.replace('\\0x22', '\\\"');
        arg = arg.replace('\\0x5c', '\\\\');
        return arg;
    });
    return {
        cmd,
        args,
    };
}
exports.default = default_1;
