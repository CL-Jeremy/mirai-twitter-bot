import { spawn } from 'child_process';
import { closeSync, existsSync, readFileSync, statSync, writeSync } from 'fs';
import * as temp from 'temp';

import { getLogger } from './loggers';

const logger = getLogger('gifski');

const sizeLimit = 10 * 2 ** 20;
const roundToEven = (n: number) => Math.ceil(n / 2) * 2;

export default async function (data: ArrayBuffer, targetWidth?: number) {
    const outputFilePath = temp.path({suffix: '.gif'});
    temp.track();
    try {
      const inputFile = temp.openSync();
      writeSync(inputFile.fd, Buffer.from(data));
      closeSync(inputFile.fd);
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
          logger.info(`gif conversion succeeded, file path: ${outputFilePath}`);
          resolve(readFileSync(outputFilePath).buffer);
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
