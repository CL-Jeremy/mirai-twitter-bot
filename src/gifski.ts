import { spawnSync } from 'child_process';
import { closeSync, readFileSync, writeSync } from 'fs';
import * as temp from 'temp';

import { getLogger } from './loggers';

const logger = getLogger('gifski');

export default function (data: ArrayBuffer, targetWidth?: number) {
    const outputFilePath = temp.path({suffix: '.gif'});
    // temp.track();
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
        args.push('--width', (Math.ceil(targetWidth / 2) * 2).toString());
      }
      logger.info(` gifski ${args.join(' ')}`);
      const gifskiInvocation = spawnSync('gifski', args, {encoding: 'utf8', timeout: 90000});
      if (gifskiInvocation.stderr) throw Error(gifskiInvocation.stderr);
      logger.info(`gif conversion succeeded, file path: ${outputFilePath}`);
      return readFileSync(outputFilePath).buffer;
    } catch (error) {
      logger.error('error converting video to gif' + error ? `message: ${error}` : '');
      throw Error('error converting video to gif');
    }
}
