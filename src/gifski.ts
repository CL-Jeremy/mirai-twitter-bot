import { spawn, spawnSync } from 'child_process';
import { closeSync, existsSync, readFileSync, statSync, unlinkSync, writeSync, PathLike } from 'fs';
import * as temp from 'temp';

import { getLogger } from './loggers';

const logger = getLogger('gifski');

const sizeLimit = 10 * 2 ** 20;
const roundToEven = (n: number) => Math.ceil(n / 2) * 2;
const isEmpty = (path: PathLike) => statSync(path).size === 0;

export default async function (data: ArrayBuffer, targetWidth?: number) {
    const outputFilePath = temp.path({suffix: '.gif'});
    temp.track();
    try {
      const inputFile = temp.openSync();
      writeSync(inputFile.fd, Buffer.from(data));
      closeSync(inputFile.fd);
      spawnSync('ffmpeg', [
        '-i',
        inputFile.path,
        '-c:a', 'copy',
        '-vn',
        inputFile.path + '.mka',
      ]);
      if (statSync(inputFile.path + '.mka').size === 0) {
        unlinkSync(inputFile.path + '.mka');
      } else {
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
      if (typeof(targetWidth) === 'number') {
        args.push('--width', roundToEven(targetWidth).toString());
      }
      logger.info(` gifski ${args.join(' ')}`);
      const gifskiSpawn = spawn('gifski', args);
      const gifskiResult = new Promise<ArrayBufferLike>((resolve, reject) => {
        const sizeChecker = setInterval(() => {
          if (existsSync(outputFilePath) && statSync(outputFilePath).size > sizeLimit) gifskiSpawn.kill();
        }, 5000);
        gifskiSpawn.on('exit', () => {
          clearInterval(sizeChecker);
          if (!existsSync(outputFilePath)) reject('no file was created on exit');
          logger.info('gif conversion succeeded, remuxing to mkv...');
          spawnSync('ffmpeg', [
            '-i',
            outputFilePath,
            ...existsSync(inputFile.path + '.mka') ? ['-i', inputFile.path + '.mka'] : [],
            '-c', 'copy',
            outputFilePath + '.mkv',
          ]);
          if (isEmpty(outputFilePath + '.mkv')) reject('remux to mkv failed');
          logger.info(`mkv remuxing succeeded, file path: ${outputFilePath}.mkv`);
          resolve(readFileSync(outputFilePath + '.mkv').buffer);
        });
      });
      const stderr = [];
      gifskiSpawn.stderr.on('data', errdata => {
        if (!gifskiSpawn.killed) gifskiSpawn.kill();
        stderr.concat(errdata);
      });
      gifskiSpawn.stderr.on('end', () => {
        if (stderr.length !== 0) throw Error(Buffer.concat(stderr).toString());
      });
      return await gifskiResult;
    } catch (error) {
      logger.error('error converting video to gif' + error ? `message: ${error}` : '');
      throw Error('error converting video to gif');
    } finally {
      temp.cleanup();
    }
}
