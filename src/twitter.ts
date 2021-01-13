import * as fs from 'fs';
import * as path from 'path';
import * as request from 'request';
import * as Twitter from 'twitter';
import TwitterTypes from 'twitter-d';

import { getLogger } from './loggers';
import QQBot, { Message, MessageChain } from './mirai';
import { BigNumOps } from './utils';
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
  private_csrf_token: string;
  private_auth_token: string;
  mode: number;
}

export class ScreenNameNormalizer {

  // tslint:disable-next-line: variable-name
  public static _queryUser: (username: string) => Promise<string>;

  public static permaFeeds = {};

  public static savePermaFeedForUser(user: FullUser) {
    this.permaFeeds[`https://twitter.com/${user.screen_name}`] = `https://twitter.com/i/user/${user.id_str}`;
  }

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
export type MediaEntity = TwitterTypes.MediaEntity;

type TwitterMod = {
  -readonly [K in keyof Twitter]: Twitter[K];
} & {
  options?: any;
}

export type Fleet = {
  created_at: string;
  deleted_at: string;
  expiration: string;
  fleet_id: string;
  fleet_thread_id: string;
  media_bounding_boxes: [{
    anchor_point_x: number;
    anchor_point_y: number;
    width: number;
    height: number;
    rotation: number;
    entity: {
        type: string;
        value: any;
    }
  }];
  media_entity: MediaEntity;
  media_key: {
    media_category: 'TWEET_IMAGE' | 'TWEET_VIDEO';
    media_id: number;
    media_id_str: string;
  };
  mentions: any;
  mentions_str: any;
  read: boolean;
  text: string;
  user_id: number;
  user_id_str: string;
};

export type Fleets = Fleet[];

export default class {

  private client: Twitter;
  private privateClient: TwitterMod
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
    this.privateClient = new Twitter({
      bearer_token: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    } as any);
    this.privateClient.request = request.defaults({
      headers: {
        ...this.privateClient.options.request_options.headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `auth_token=${opt.private_auth_token}; ct0=${opt.private_csrf_token};`,
        'X-CSRF-Token': opt.private_csrf_token,
      }
    });
    this.lockfile = opt.lockfile;
    this.lock = opt.lock;
    this.workInterval = opt.workInterval;
    this.bot = opt.bot;
    this.mode = opt.mode;
    ScreenNameNormalizer._queryUser = this.queryUser;
  }

  public launch = () => {
    this.webshot = new Webshot(
      this.mode,
      () => setTimeout(this.work, this.workInterval * 1000)
    );
  }

  public queryUser = (username: string) =>
    this.client.get('users/show', {screen_name: username})
    .then((user: FullUser) => {
      ScreenNameNormalizer.savePermaFeedForUser(user);
      return user.screen_name;
    })

  private workOnFleets = (
    user: FullUser,
    fleets: Fleets,
    sendFleets: (msg: MessageChain, text: string) => void
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
    return this.webshot(user, fleets, uploader, sendFleets, this.webshotDelay);
  }

  private sendFleets = (source?: string, ...to: IChat[]) =>
  (msg: MessageChain, text: string) => {
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
          terminate(this.bot.sendTo(subscriber, text));
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

    type FleetFeed = {fleet_threads: {fleets: Fleets}[]};
    let user: FullUser;
    let match = currentFeed.match(/https:\/\/twitter.com\/([^\/]+)/);
    if (match) match = lock.threads[currentFeed].permaFeed.match(/https:\/\/twitter.com\/i\/user\/([^\/]+)/);
    if (!match) {
      logger.error(`cannot get endpoint for feed ${currentFeed}`);
      return;
    }
    let endpoint = `https://api.twitter.com/fleets/v1/user_fleets?user_id=${match[1]}`;
    const promise = new Promise<FleetFeed | void>((resolve, reject) => {
      this.privateClient.get(endpoint, (error, fleetFeed: FleetFeed, _) => {
        if (error) reject(error);
        else resolve(fleetFeed);
      });
    });

    this.client.get('users/show', {user_id: match[1]})
    .then((fullUser: FullUser) => { user = fullUser; return promise; })
    .catch(error => {
      logger.error(`unhandled error on fetching fleets for ${currentFeed}: ${JSON.stringify(error)}`);
    })
    .then((fleetFeed: FleetFeed) => {
      logger.debug(`private api returned ${JSON.stringify(fleetFeed)} for feed ${currentFeed}`);
      logger.debug(`api returned ${JSON.stringify(user)} for owner of feed ${currentFeed}`);
      const currentThread = lock.threads[currentFeed];

      const updateDate = () => currentThread.updatedAt = new Date().toString();
      if (!fleetFeed || fleetFeed.fleet_threads.length === 0) { updateDate(); return; }

      let fleets = fleetFeed.fleet_threads[0].fleets;
      const bottomOfFeed = fleets.slice(-1)[0].fleet_id.substring(3);
      const updateOffset = () => currentThread.offset = bottomOfFeed;

      if (currentThread.offset === '-1') { updateOffset(); return; }
      if (currentThread.offset !== '0') {
        const readCount = fleets.findIndex(fleet => {
          return Number(BigNumOps.plus(fleet.fleet_id.substring(3), `-${currentThread.offset}`)) > 0;
        });
        if (readCount === -1) return;
        fleets = fleets.slice(readCount);
      }

      return this.workOnFleets(user, fleets, this.sendFleets(`thread ${currentFeed}`, ...currentThread.subscribers))
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
    })
  }
}
