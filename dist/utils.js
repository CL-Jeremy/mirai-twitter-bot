"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigNumOps = exports.chainPromises = void 0;
const chainPromises = (promises, reducer = (p1, p2) => p1.then(() => p2), initialValue) => promises.reduce(reducer, Promise.resolve(initialValue));
exports.chainPromises = chainPromises;
const splitBigNumAt = (num, at) => num.replace(RegExp(String.raw `^([+-]?)(\d+)(\d{${at}})$`), '$1$2,$1$3')
    .replace(/^([^,]*)$/, '0,$1').split(',')
    .map(Number);
const bigNumPlus = (num1, num2) => {
    let [high, low] = [splitBigNumAt(num1, 15), splitBigNumAt(num2, 15)]
        .reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
    const [highSign, lowSign] = [high, low].map(Math.sign);
    if (highSign === 0)
        return low.toString();
    if (highSign !== lowSign) {
        [high, low] = [high - highSign, low - lowSign * Math.pow(10, 15)];
    }
    else {
        [high, low] = [high + Math.trunc(low / Math.pow(10, 15)), low % Math.pow(10, 15)];
    }
    if (high === 0)
        return low.toString();
    return `${high}${Math.abs(low).toString().padStart(15, '0')}`;
};
const bigNumCompare = (num1, num2) => Math.sign(Number(bigNumPlus(num1, num2.replace(/^([+-]?)(\d+)/, (_, $1, $2) => `${$1 === '-' ? '' : '-'}${$2}`))));
const bigNumMin = (...nums) => {
    if (!nums || !nums.length)
        return undefined;
    let min = nums[0];
    for (let i = 1; i < nums.length; i++) {
        if (bigNumCompare(nums[i], min) < 0)
            min = nums[i];
    }
    return min;
};
const bigNumLShift = (num, by) => {
    if (by < 0)
        throw Error('cannot perform right shift');
    const at = Math.trunc((52 - by) / 10) * 3;
    const [high, low] = splitBigNumAt(num, at).map(n => n * Math.pow(2, by));
    return bigNumPlus(high + '0'.repeat(at), low.toString());
};
const parseBigNum = (str) => ((str === null || str === void 0 ? void 0 : str.match(/^-?\d+$/)) || [''])[0].replace(/^(-)?0*/, '$1');
exports.BigNumOps = {
    splitAt: splitBigNumAt,
    plus: bigNumPlus,
    compare: bigNumCompare,
    min: bigNumMin,
    lShift: bigNumLShift,
    parse: parseBigNum,
};
