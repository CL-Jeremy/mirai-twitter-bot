#!/usr/bin/env node

import * as commandLineUsage from 'command-line-usage';
import * as fs from 'fs';
import * as path from 'path';

import { list, sub, unsub } from './command';
import { getLogger, setLogLevels } from './loggers';
import QQBot from './mirai';
import Worker from './twitter';

const logger = getLogger();

const sections = [
  {
    header: 'MiraiTS Twitter Bot',
    content: 'The QQ Bot that forwards twitters.',
  },
  {
    header: 'Synopsis',
    content: [
      '$ mirai-twitter-bot {underline config.json}',
      '$ mirai-twitter-bot {bold --help}',
    ],
  },
  {
    header: 'Documentation',
    content: [
      'Project home: {underline https://github.com/CL-Jeremy/mirai-twitter-bot}',
      'Example config: {underline https://git.io/JJ0jN}',
    ],
  },
];

const usage = commandLineUsage(sections);

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === 'help' || args[0] === '-h' || args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}

const configPath = args[0];

let config;
try {
  config = require(path.resolve(configPath));
} catch (e) {
  console.log('Failed to parse config file: ', configPath);
  console.log(usage);
  process.exit(1);
}

if (config.twitter_consumer_key === undefined ||
  config.twitter_consumer_secret === undefined ||
  config.twitter_access_token_key === undefined ||
  config.twitter_access_token_secret === undefined) {
  console.log('twitter_consumer_key twitter_consumer_secret twitter_access_token_key twitter_access_token_secret are required');
  process.exit(1);
}
if (config.mirai_http_host === undefined) {
  config.mirai_http_host = '127.0.0.1';
  logger.warn('mirai_http_host is undefined, use 127.0.0.1 as default');
}
if (config.mirai_http_port === undefined) {
  config.mirai_http_port = 8080;
  logger.warn('mirai_http_port is undefined, use 8080 as default');
}
if (config.mirai_access_token === undefined) {
  config.mirai_access_token = '';
  logger.warn('mirai_access_token is undefined, use empty string as default');
}
if (config.lockfile === undefined) {
  config.lockfile = 'subscriber.lock';
}
if (config.work_interval === undefined) {
  config.work_interval = 60;
}
if (config.webshot_delay === undefined) {
  config.webshot_delay = 5000;
}
if (config.loglevel === undefined) {
  config.loglevel = 'info';
}
if (typeof config.mode !== 'number') {
  config.mode = 0;
}
if (typeof config.resume_on_start !== 'boolean') {
  config.resume_on_start = false;
}

setLogLevels(config.loglevel);

let lock: ILock;
if (fs.existsSync(path.resolve(config.lockfile))) {
  try {
    lock = JSON.parse(fs.readFileSync(path.resolve(config.lockfile), 'utf8'));
  } catch (err) {
    logger.error(`Failed to parse lockfile ${config.lockfile}: `, err);
    lock = {
      workon: 0,
      feed: [],
      threads: {},
    };
  }
  fs.access(path.resolve(config.lockfile), fs.constants.W_OK, err => {
    if (err) {
      logger.fatal(`cannot write lockfile ${path.resolve(config.lockfile)}, permission denied`);
      process.exit(1);
    }
  });
} else {
  lock = {
    workon: 0,
    feed: [],
    threads: {},
  };
  try {
    fs.writeFileSync(path.resolve(config.lockfile), JSON.stringify(lock));
  } catch (err) {
    logger.fatal(`cannot write lockfile ${path.resolve(config.lockfile)}, permission denied`);
    process.exit(1);
  }
}

if (!config.resume_on_start) {
  Object.keys(lock.threads).forEach(key => {
    lock.threads[key].offset = '-1';
  });
}

const qq = new QQBot({
  access_token: config.mirai_access_token,
  host: config.mirai_http_host,
  port: config.mirai_http_port,
  bot_id: config.mirai_bot_qq,
  list: (c, a) => list(c, a, lock),
  sub: (c, a) => sub(c, a, lock, config.lockfile),
  unsub: (c, a) => unsub(c, a, lock, config.lockfile),
});

const worker = new Worker({
  consumer_key: config.twitter_consumer_key,
  consumer_secret: config.twitter_consumer_secret,
  access_token_key: config.twitter_access_token_key,
  access_token_secret: config.twitter_access_token_secret,
  lock,
  lockfile: config.lockfile,
  workInterval: config.work_interval,
  bot: qq,
  webshotDelay: config.webshot_delay,
  mode: config.mode,
});
worker.launch();

qq.connect();
