import * as fs from 'fs';
import * as path from 'path';
import * as Twitter from 'twitter';
import TwitterTypes from 'twitter-d';

import { getLogger } from './loggers';
import QQBot, { Message, MessageChain } from './mirai';
import { chainPromises, BigNumOps } from './utils';
import Webshot from './webshot';

interface IWorkerOption {
  lock: ILock;
  lockfile: string;
  bot: QQBot;
  workInterval: number;
  webshotDelay: number;
  consumer_key: string;
  consumer_secret: string;
  access_token_key: string;
  access_token_secret: string;
  mode: number;
}

export class ScreenNameNormalizer {

  // tslint:disable-next-line: variable-name
  public static _queryUser: (username: string) => Promise<string>;

  public static normalize = (username: string) => username.toLowerCase().replace(/^@/, '');

  public static async normalizeLive(username: string) {
    if (this._queryUser) {
      return await this._queryUser(username)
      .catch((err: {code: number, message: string}[]) => {
        if (err[0].code !== 50) {
          logger.warn(`error looking up user: ${err[0].message}`);
          return username;
        }
        return null;
      });
    }
    return this.normalize(username);
  }
}

export let sendTweet = (id: string, receiver: IChat): void => {
  throw Error();
};

export interface ITimelineQueryConfig {
  username: string;
  count?: number;
  since?: string;
  until?: string;
  noreps?: boolean;
  norts?: boolean;
}

export let sendTimeline = (
  conf: {[key in keyof ITimelineQueryConfig]: string},
  receiver: IChat
): void => {
  throw Error();
};

const TWITTER_EPOCH = 1288834974657;
const snowflake = (epoch: number) =>
  Number.isNaN(epoch) ? undefined :
    BigNumOps.lShift(String(epoch - 1 - TWITTER_EPOCH), 22);

const logger = getLogger('twitter');
const maxTrials = 3;
const uploadTimeout = 10000;
const retryInterval = 1500;
const ordinal = (n: number) => {
  switch ((Math.trunc(n / 10) % 10 === 1) ? 0 : n % 10) {
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
const retryOnError = <T, U>(
  doWork: () => Promise<T>,
  onRetry: (error, count: number, terminate: (defaultValue: U) => void) => void
) => new Promise<T | U>(resolve => {
  const retry = (reason, count: number) => {
    setTimeout(() => {
      let terminate = false;
      onRetry(reason, count, defaultValue => { terminate = true; resolve(defaultValue); });
      if (!terminate) doWork().then(resolve).catch(error => retry(error, count + 1));
    }, retryInterval);
  };
  doWork().then(resolve).catch(error => retry(error, 1));
});

export type FullUser = TwitterTypes.FullUser;
export type Entities = TwitterTypes.Entities;
export type ExtendedEntities = TwitterTypes.ExtendedEntities;
export type MediaEntity = TwitterTypes.MediaEntity;

interface ITweet extends TwitterTypes.Status {
  user: FullUser;
  retweeted_status?: Tweet;
}

interface IFoldedTweet extends TwitterTypes.Status {
  text: string;
  full_text: undefined;
}

export type Tweet = ITweet;
export type Tweets = ITweet[];

export default class {

  private client: Twitter;
  private lock: ILock;
  private lockfile: string;
  private workInterval: number;
  private bot: QQBot;
  private webshotDelay: number;
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
    this.mode = opt.mode;
    ScreenNameNormalizer._queryUser = this.queryUser;
    sendTweet = (id, receiver) => {
      this.getTweet(id, this.sendTweets(`tweet ${id}`, receiver))
      .catch((err: {code: number, message: string}[]) => {
        if (err[0].code !== 144) {
          logger.warn(`error retrieving tweet: ${err[0].message}`);
          this.bot.sendTo(receiver, `获取推文时出现错误：${err[0].message}`);
        }
        this.bot.sendTo(receiver, '找不到请求的推文，它可能已被删除。');
      });
    };
    sendTimeline = ({username, count, since, until, noreps, norts}, receiver) => {
      const countNum = Number(count) || 10;
      (countNum > 0 ? this.queryTimeline : this.queryTimelineReverse)({
        username,
        count: Math.abs(countNum),
        since: BigNumOps.parse(since) || snowflake(new Date(since).getTime()),
        until: BigNumOps.parse(until) || snowflake(new Date(until).getTime()),
        noreps: {on: true, off: false}[noreps],
        norts: {on: true, off: false}[norts],
      })
      .then(tweets => chainPromises(
        tweets.map(tweet => this.bot.sendTo(receiver, `\
编号：${tweet.id_str}
时间：${tweet.created_at}
媒体：${tweet.extended_entities ? '有' : '无'}
正文：\n${tweet.text}`
        ))
        .concat(this.bot.sendTo(receiver, tweets.length ?
          '时间线查询完毕，使用 /twitterpic_view <编号> 查看媒体推文详细内容。' :
            '时间线查询完毕，没有找到符合条件的媒体推文。'
        ))
      ))
      .catch((err: {code: number, message: string}[]) => {
        if (err[0].code !== 34) {
          logger.warn(`error retrieving timeline: ${err[0].message}`);
          return this.bot.sendTo(receiver, `获取时间线时出现错误：${err[0].message}`);
        }
        this.bot.sendTo(receiver, `找不到用户 ${username.replace(/^@?(.*)$/, '@$1')}。`);
      });
    };
  }

  public launch = () => {
    this.webshot = new Webshot(
      this.mode,
      () => setTimeout(this.work, this.workInterval * 1000)
    );
  }

  public queryUser = (username: string) =>
    this.client.get('users/show', {screen_name: username})
    .then((user: FullUser) => user.screen_name)

  public queryTimelineReverse = (conf: ITimelineQueryConfig) => {
    if (!conf.since) return this.queryTimeline(conf);
    const count = conf.count;
    const maxID = conf.until;
    conf.count = undefined;
    const until = () =>
      BigNumOps.min(maxID, BigNumOps.plus(conf.since, String(7 * 24 * 3600 * 1000 * 2 ** 22)));
    conf.until = until();
    const promise = (tweets: IFoldedTweet[]): Promise<IFoldedTweet[]> =>
      this.queryTimeline(conf).then(newTweets => {
        tweets = newTweets.concat(tweets);
        conf.since = conf.until;
        conf.until = until();
        if (
          tweets.length >= count ||
          BigNumOps.compare(conf.since, conf.until) >= 0
        ) {
          return tweets.slice(-count);
        }
        return promise(tweets);
      });
    return promise([]);
  }

  public queryTimeline = (
    { username, count, since, until, noreps, norts }: ITimelineQueryConfig
  ) => {
    username = username.replace(/^@?(.*)$/, '@$1');
    logger.info(`querying timeline of ${username} with config: ${
      JSON.stringify({
        ...(count && {count}),
        ...(since && {since}),
        ...(until && {until}),
        ...(noreps && {noreps}),
        ...(norts && {norts}),
    })}`);
    const fetchTimeline = (
      config = {
        screen_name: username.slice(1),
        trim_user: true,
        exclude_replies: noreps ?? true,
        include_rts: !(norts ?? false),
        since_id: since,
        max_id: until,
      },
      tweets: IFoldedTweet[] = []
    ): Promise<IFoldedTweet[]> =>
      this.client.get('statuses/user_timeline', config)
        .then((newTweets: IFoldedTweet[]) => {
          if (newTweets.length) {
            config.max_id = BigNumOps.plus('-1', newTweets[newTweets.length - 1].id_str);
            logger.info(`timeline query of ${username} yielded ${
              newTweets.length
            } new tweets, next query will start at offset ${config.max_id}`);
            tweets.push(...newTweets.filter(tweet => tweet.extended_entities));
          }
          if (!newTweets.length || tweets.length >= count) {
            logger.info(`timeline query of ${username} finished successfully, ${
              tweets.length
            } tweets with extended entities have been fetched`);
            return tweets.slice(0, count);
          }
          return fetchTimeline(config, tweets);
        });
    return fetchTimeline();
  }

  private workOnTweets = (
    tweets: Tweets,
    sendTweets: (msg: MessageChain, text: string, author: string) => void
  ) => {
    const uploader = (
      message: ReturnType<typeof Message.Image>,
      lastResort: (...args) => ReturnType<typeof Message.Plain>
    ) => {
      let timeout = uploadTimeout;
      return retryOnError(() =>
        this.bot.uploadPic(message, timeout).then(() => message),
      (_, count, terminate: (defaultValue: ReturnType<typeof Message.Plain>) => void) => {
        if (count <= maxTrials) {
          timeout *= (count + 2) / (count + 1);
          logger.warn(`retry uploading for the ${ordinal(count)} time...`);
        } else {
          logger.warn(`${count - 1} consecutive failures while uploading, trying plain text instead...`);
          terminate(lastResort());
        }
      });
    };
    return this.webshot(tweets, uploader, sendTweets, this.webshotDelay);
  }

  public getTweet = (id: string, sender: (msg: MessageChain, text: string, author: string) => void) => {
    const endpoint = 'statuses/show';
    const config = {
      id,
      tweet_mode: 'extended',
    };
    return this.client.get(endpoint, config)
    .then((tweet: Tweet) => {
      logger.debug(`api returned tweet ${JSON.stringify(tweet)} for query id=${id}`);
      return this.workOnTweets([tweet], sender);
    });
  }

  private sendTweets = (source?: string, ...to: IChat[]) =>
  (msg: MessageChain, text: string, author: string) => {
    to.forEach(subscriber => {
      logger.info(`pushing data${source ? ` of ${source}` : ''} to ${JSON.stringify(subscriber)}`);
      retryOnError(
        () => this.bot.sendTo(subscriber, msg),
      (_, count, terminate: (doNothing: Promise<void>) => void) => {
        if (count <= maxTrials) {
          logger.warn(`retry sending to ${subscriber.chatID} for the ${ordinal(count)} time...`);
        } else {
          logger.warn(`${count - 1} consecutive failures while sending` +
            'message chain, trying plain text instead...');
          terminate(this.bot.sendTo(subscriber, author + text));
        }
      });
    });
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

    const currentFeed = lock.feed[lock.workon];
    logger.debug(`pulling feed ${currentFeed}`);

    const promise = new Promise(resolve => {
      let match = currentFeed.match(/https:\/\/twitter.com\/([^\/]+)\/lists\/([^\/]+)/);
      let config: any;
      let endpoint: string;
      if (match) {
        if (match[1] === 'i') {
          config = {
            list_id: match[2],
            tweet_mode: 'extended',
          };
        } else {
          config = {
            owner_screen_name: match[1],
            slug: match[2],
            tweet_mode: 'extended',
          };
        }
        endpoint = 'lists/statuses';
      } else {
        match = currentFeed.match(/https:\/\/twitter.com\/([^\/]+)/);
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
        const offset = lock.threads[currentFeed].offset as unknown as number;
        if (offset > 0) config.since_id = offset;
        if (offset < -1) config.max_id = (offset as unknown as string).slice(1) as unknown as number;
        this.client.get(endpoint, config, (error, tweets, response) => {
          if (error) {
            if (error instanceof Array && error.length > 0 && error[0].code === 34) {
              logger.warn(`error on fetching tweets for ${currentFeed}: ${JSON.stringify(error)}`);
              lock.threads[currentFeed].subscribers.forEach(subscriber => {
                logger.info(`sending notfound message of ${currentFeed} to ${JSON.stringify(subscriber)}`);
                this.bot.sendTo(subscriber, `链接 ${currentFeed} 指向的用户或列表不存在，请退订。`).catch();
              });
            } else {
              logger.error(`unhandled error on fetching tweets for ${currentFeed}: ${JSON.stringify(error)}`);
            }
            resolve();
          } else resolve(tweets);
        });
      }
    });

    promise.then((tweets: Tweets) => {
      logger.debug(`api returned ${JSON.stringify(tweets)} for feed ${currentFeed}`);
      const currentThread = lock.threads[currentFeed];

      const updateDate = () => currentThread.updatedAt = new Date().toString();
      if (!tweets || tweets.length === 0) { updateDate(); return; }

      const topOfFeed = tweets[0].id_str;
      logger.info(`current offset: ${currentThread.offset}, current top of feed: ${topOfFeed}`);
      const bottomOfFeed = tweets[tweets.length - 1].id_str;
      const setOffset = (offset: string) => currentThread.offset = offset;
      const updateOffset = () => setOffset(topOfFeed);
      tweets = tweets.filter(twi => !twi.retweeted_status && twi.extended_entities);
      logger.info(`found ${tweets.length} tweets with extended entities`);
      if (currentThread.offset === '-1') { updateOffset(); return; }
      if (currentThread.offset as unknown as number <= 0) {
        if (tweets.length === 0) {
          setOffset(BigNumOps.plus('1', '-' + bottomOfFeed));
          lock.workon--;
          return;
        }
        tweets.splice(1);
      }
      if (tweets.length === 0) { updateDate(); updateOffset(); return; }

      return this.workOnTweets(tweets, this.sendTweets(`thread ${currentFeed}`, ...currentThread.subscribers))
      .then(updateDate).then(updateOffset);
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
