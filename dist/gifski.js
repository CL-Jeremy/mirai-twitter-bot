"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const temp = require("temp");
const loggers_1 = require("./loggers");
const logger = loggers_1.getLogger('gifski');
function default_1(data, targetWidth) {
    const outputFilePath = temp.path({ suffix: '.gif' });
    // temp.track();
    try {
        const inputFile = temp.openSync();
        fs_1.writeSync(inputFile.fd, Buffer.from(data));
        fs_1.closeSync(inputFile.fd);
        logger.info(`saved video file to ${inputFile.path}, starting gif conversion...`);
        const args = [
            inputFile.path,
            '-o',
            outputFilePath,
            '--fps',
            '12.5',
            '--quiet',
            '--quality',
            '90',
        ];
        if (typeof (targetWidth) === 'number') {
            args.push('--width', (Math.ceil(targetWidth / 2) * 2).toString());
        }
        logger.info(` gifski ${args.join(' ')}`);
        const gifskiInvocation = child_process_1.spawnSync('gifski', args, { encoding: 'utf8', timeout: 90000 });
        if (gifskiInvocation.stderr)
            throw Error(gifskiInvocation.stderr);
        logger.info(`gif conversion succeeded, file path: ${outputFilePath}`);
        return fs_1.readFileSync(outputFilePath).buffer;
    }
    catch (error) {
        logger.error('error converting video to gif' + error ? `message: ${error}` : '');
        throw Error('error converting video to gif');
    }
}
exports.default = default_1;
