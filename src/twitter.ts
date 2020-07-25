import * as fs from 'fs';
import * as path from 'path';
import * as Twitter from 'twitter';

import { getLogger } from './loggers';
import QQBot, { MessageChain, MiraiMessage as Message } from './mirai';
import Webshot from './webshot';

interface IWorkerOption {
  lock: ILock;
  lockfile: string;
  bot: QQBot;
  workInterval: number;
  webshotDelay: number;
  webshotOutDir: string;
  consumer_key: string;
  consumer_secret: string;
  access_token_key: string;
  access_token_secret: string;
  mode: number;
}

const logger = getLogger('twitter');

export default class {

  private client;
  private lock: ILock;
  private lockfile: string;
  private workInterval: number;
  private bot: QQBot;
  private webshotDelay: number;
  private webshotOutDir: string;
  private webshot: Webshot;
  private mode: number;

  constructor(opt: IWorkerOption) {
    this.client = new Twitter({
      consumer_key: opt.consumer_key,
      consumer_secret: opt.consumer_secret,
      access_token_key: opt.access_token_key,
      access_token_secret: opt.access_token_secret,
    });
    this.lockfile = opt.lockfile;
    this.lock = opt.lock;
    this.workInterval = opt.workInterval;
    this.bot = opt.bot;
    this.webshotDelay = opt.webshotDelay;
    this.webshotOutDir = opt.webshotOutDir;
    this.mode = opt.mode;
  }

  public launch = () => {
    this.webshot = new Webshot(
      this.webshotOutDir,
      this.mode,
      () => setTimeout(this.work, this.workInterval * 1000)
    );
  }

  public work = () => {
    const lock = this.lock;
    if (this.workInterval < 1) this.workInterval = 1;
    if (lock.feed.length === 0) {
      setTimeout(() => {
        this.work();
      }, this.workInterval * 1000);
      return;
    }
    if (lock.workon >= lock.feed.length) lock.workon = 0;
    if (!lock.threads[lock.feed[lock.workon]] ||
      !lock.threads[lock.feed[lock.workon]].subscribers ||
      lock.threads[lock.feed[lock.workon]].subscribers.length === 0) {
      logger.warn(`nobody subscribes thread ${lock.feed[lock.workon]}, removing from feed`);
      delete lock.threads[lock.feed[lock.workon]];
      lock.feed.splice(lock.workon, 1);
      fs.writeFileSync(path.resolve(this.lockfile), JSON.stringify(lock));
      this.work();
      return;
    }

    logger.debug(`pulling feed ${lock.feed[lock.workon]}`);

    const promise = new Promise(resolve => {
      let match = lock.feed[lock.workon].match(/https:\/\/twitter.com\/([^\/]+)\/lists\/([^\/]+)/);
      let config: any;
      let endpoint: string;
      if (match) {
        config = {
          owner_screen_name: match[1],
          slug: match[2],
          tweet_mode: 'extended',
        };
        endpoint = 'lists/statuses';
      } else {
        match = lock.feed[lock.workon].match(/https:\/\/twitter.com\/([^\/]+)/);
        if (match) {
          config = {
            screen_name: match[1],
            exclude_replies: false,
            tweet_mode: 'extended',
          };
          endpoint = 'statuses/user_timeline';
        }
      }

      if (endpoint) {
        const offset = lock.threads[lock.feed[lock.workon]].offset;
        if (offset > 0) config.since_id = offset;
        this.client.get(endpoint, config, (error, tweets, response) => {
          if (error) {
            if (error instanceof Array && error.length > 0 && error[0].code === 34) {
              logger.warn(`error on fetching tweets for ${lock.feed[lock.workon]}: ${JSON.stringify(error)}`);
              lock.threads[lock.feed[lock.workon]].subscribers.forEach(subscriber => {
                logger.info(`sending notfound message of ${lock.feed[lock.workon]} to ${JSON.stringify(subscriber)}`);
                this.bot.sendTo(subscriber, `链接 ${lock.feed[lock.workon]} 指向的用户或列表不存在，请退订。`).catch();
              });
            } else {
              logger.error(`unhandled error on fetching tweets for ${lock.feed[lock.workon]}: ${JSON.stringify(error)}`);
            }
            resolve();
          } else resolve(tweets);
        });
      }
    });

    promise.then((tweets: any) => {
      logger.debug(`api returned ${JSON.stringify(tweets)} for feed ${lock.feed[lock.workon]}`);
      if (!tweets || tweets.length === 0) {
        lock.threads[lock.feed[lock.workon]].updatedAt = new Date().toString();
        return;
      }
      if (lock.threads[lock.feed[lock.workon]].offset === -1) {
        lock.threads[lock.feed[lock.workon]].offset = tweets[0].id_str;
        return;
      }
      if (lock.threads[lock.feed[lock.workon]].offset === 0) tweets.splice(1);

      const maxCount = 3;
      let sendTimeout = 5000;
      const retryTimeout = 1500;
      const ordinal = (n: number) => {
        switch ((~~(n / 10) % 10 === 1) ? 0 : n % 10) {
          case 1:
            return `${n}st`;
          case 2:
            return `${n}nd`;
          case 3:
            return `${n}rd`;
          default:
            return `${n}th`;
        }
      };
      const sendTweets = (msg: MessageChain, text: string, author: string) => {
        lock.threads[lock.feed[lock.workon]].subscribers.forEach(subscriber => {
          logger.info(`pushing data of thread ${lock.feed[lock.workon]} to ${JSON.stringify(subscriber)}`);
          const retry = (reason, count: number) => { // workaround for https://github.com/mamoe/mirai/issues/194
            if (count <= maxCount) sendTimeout *= count / (count - 1);
            setTimeout(() => {
              (msg as MessageChain).forEach((message, pos) => {
                if (count > maxCount && message.type === 'Image') {
                  if (pos === 0) {
                    logger.warn(`${count - 1} consecutive failures sending webshot, trying plain text instead...`);
                    msg[pos] = Message.Plain(author + text);
                  } else {
                    msg[pos] = Message.Plain(`[失败的图片：${message.path}]`);
                  }
                }
              });
              logger.warn(`retry sending to ${subscriber.chatID} for the ${ordinal(count)} time...`);
              this.bot.sendTo(subscriber, msg, sendTimeout).catch(error => retry(error, count + 1));
            }, retryTimeout);
          };
          this.bot.sendTo(subscriber, msg, sendTimeout).catch(error => retry(error, 1));
        });
      };
      return (this.webshot as any)(tweets, sendTweets, this.webshotDelay)
      .then(() => {
        lock.threads[lock.feed[lock.workon]].offset = tweets[0].id_str;
        lock.threads[lock.feed[lock.workon]].updatedAt = new Date().toString();
      });
    })
      .then(() => {
        lock.workon++;
        let timeout = this.workInterval * 1000 / lock.feed.length;
        if (timeout < 1000) timeout = 1000;
        fs.writeFileSync(path.resolve(this.lockfile), JSON.stringify(lock));
        setTimeout(() => {
          this.work();
        }, timeout);
      });

  }
}
