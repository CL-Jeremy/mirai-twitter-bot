import { spawnSync } from 'child_process';
import * as temp from 'temp';

import { getLogger } from './loggers';
import { readFileSync, writeSync, closeSync } from 'fs';

const logger = getLogger('gifski');

export default function (data: ArrayBuffer) {
    const outputFilePath = temp.path({suffix: '.gif'});
    // temp.track();
    try {
      const inputFile = temp.openSync();
      writeSync(inputFile.fd, Buffer.from(data));
      closeSync(inputFile.fd);
      logger.info(`saved video file to ${inputFile.path}, starting gif conversion...`)
      const args = [
        '--fps',
        '12.5',
        '--quiet',
        '--quality',
        '80',
        '-o',
        outputFilePath,
        inputFile.path
      ];
      logger.info(` gifski ${args.join(' ')}`);
      const gifskiInvocation = spawnSync('gifski', args, {encoding: 'utf8', timeout: 90000});
      if (gifskiInvocation.stderr) throw Error(gifskiInvocation.stderr);
      logger.info(`gif conversion succeeded, file path: ${outputFilePath}`)
      return readFileSync(outputFilePath).buffer;
    } catch (error) {
      logger.error('error converting video to gif' + error ? `message: ${error}` : '');
      throw Error('error converting video to gif');
    }
}