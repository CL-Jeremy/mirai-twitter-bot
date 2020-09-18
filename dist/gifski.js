"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const temp = require("temp");
const loggers_1 = require("./loggers");
const logger = loggers_1.getLogger('gifski');
const sizeLimit = 10 * Math.pow(2, 20);
const roundToEven = (n) => Math.ceil(n / 2) * 2;
const isEmpty = (path) => fs_1.statSync(path).size === 0;
function default_1(data, targetWidth) {
    return __awaiter(this, void 0, void 0, function* () {
        const outputFilePath = temp.path({ suffix: '.gif' });
        temp.track();
        try {
            const inputFile = temp.openSync();
            fs_1.writeSync(inputFile.fd, Buffer.from(data));
            fs_1.closeSync(inputFile.fd);
            child_process_1.spawnSync('ffmpeg', [
                '-i',
                inputFile.path,
                '-c:a', 'copy',
                '-vn',
                inputFile.path + '.mka',
            ]);
            if (fs_1.statSync(inputFile.path + '.mka').size === 0) {
                fs_1.unlinkSync(inputFile.path + '.mka');
            }
            else {
                logger.info(`extracted audio to ${inputFile.path + '.mka'}`);
            }
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
                args.push('--width', roundToEven(targetWidth).toString());
            }
            logger.info(` gifski ${args.join(' ')}`);
            const gifskiSpawn = child_process_1.spawn('gifski', args);
            const gifskiResult = new Promise((resolve, reject) => {
                const sizeChecker = setInterval(() => {
                    if (fs_1.existsSync(outputFilePath) && fs_1.statSync(outputFilePath).size > sizeLimit)
                        gifskiSpawn.kill();
                }, 5000);
                gifskiSpawn.on('exit', () => {
                    clearInterval(sizeChecker);
                    if (!fs_1.existsSync(outputFilePath))
                        reject('no file was created on exit');
                    logger.info('gif conversion succeeded, remuxing to mkv...');
                    child_process_1.spawnSync('ffmpeg', [
                        '-i',
                        outputFilePath,
                        ...fs_1.existsSync(inputFile.path + '.mka') ? ['-i', inputFile.path + '.mka'] : [],
                        '-c', 'copy',
                        outputFilePath + '.mkv',
                    ]);
                    if (isEmpty(outputFilePath + '.mkv'))
                        reject('remux to mkv failed');
                    logger.info(`mkv remuxing succeeded, file path: ${outputFilePath}.mkv`);
                    resolve(fs_1.readFileSync(outputFilePath + '.mkv').buffer);
                });
            });
            const stderr = [];
            gifskiSpawn.stderr.on('data', errdata => {
                if (!gifskiSpawn.killed)
                    gifskiSpawn.kill();
                stderr.concat(errdata);
            });
            gifskiSpawn.stderr.on('end', () => {
                if (stderr.length !== 0)
                    throw Error(Buffer.concat(stderr).toString());
            });
            return yield gifskiResult;
        }
        catch (error) {
            logger.error('error converting video to gif' + error ? `message: ${error}` : '');
            throw Error('error converting video to gif');
        }
        finally {
            temp.cleanup();
        }
    });
}
exports.default = default_1;
