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
exports.sendAllFleets = exports.ScreenNameNormalizer = void 0;
const fs = require("fs");
const path = require("path");
const request = require("request");
const Twitter = require("twitter");
const loggers_1 = require("./loggers");
const utils_1 = require("./utils");
const webshot_1 = require("./webshot");
class ScreenNameNormalizer {
    static savePermaFeedForUser(user) {
        this.permaFeeds[`https://twitter.com/${user.screen_name}`] = `https://twitter.com/i/user/${user.id_str}`;
    }
    static normalizeLive(username) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._queryUser) {
                return yield this._queryUser(username)
                    .catch((err) => {
                    if (err[0].code !== 50) {
                        logger.warn(`error looking up user: ${err[0].message}`);
                        return username;
                    }
                    return null;
                });
            }
            return this.normalize(username);
        });
    }
}
exports.ScreenNameNormalizer = ScreenNameNormalizer;
ScreenNameNormalizer.permaFeeds = {};
ScreenNameNormalizer.normalize = (username) => username.toLowerCase().replace(/^@/, '');
let sendAllFleets = (username, receiver) => {
    throw Error();
};
exports.sendAllFleets = sendAllFleets;
const logger = loggers_1.getLogger('twitter');
const maxTrials = 3;
const uploadTimeout = 10000;
const retryInterval = 1500;
const ordinal = (n) => {
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
const retryOnError = (doWork, onRetry) => new Promise(resolve => {
    const retry = (reason, count) => {
        setTimeout(() => {
            let terminate = false;
            onRetry(reason, count, defaultValue => { terminate = true; resolve(defaultValue); });
            if (!terminate)
                doWork().then(resolve).catch(error => retry(error, count + 1));
        }, retryInterval);
    };
    doWork().then(resolve).catch(error => retry(error, 1));
});
class default_1 {
    constructor(opt) {
        this.launch = () => {
            this.webshot = new webshot_1.default(this.mode, () => setTimeout(this.work, this.workInterval * 1000));
        };
        this.queryUser = (username) => this.client.get('users/show', { screen_name: username })
            .then((user) => {
            ScreenNameNormalizer.savePermaFeedForUser(user);
            return user.screen_name;
        });
        this.workOnFleets = (user, fleets, sendFleets) => {
            const uploader = (message, lastResort) => {
                let timeout = uploadTimeout;
                return retryOnError(() => this.bot.uploadPic(message, timeout).then(() => message), (_, count, terminate) => {
                    if (count <= maxTrials) {
                        timeout *= (count + 2) / (count + 1);
                        logger.warn(`retry uploading for the ${ordinal(count)} time...`);
                    }
                    else {
                        logger.warn(`${count - 1} consecutive failures while uploading, trying plain text instead...`);
                        terminate(lastResort());
                    }
                });
            };
            return this.webshot(user, fleets, uploader, sendFleets, this.webshotDelay);
        };
        this.sendFleets = (source, ...to) => (msg, text) => {
            to.forEach(subscriber => {
                logger.info(`pushing data${source ? ` of ${source}` : ''} to ${JSON.stringify(subscriber)}`);
                retryOnError(() => this.bot.sendTo(subscriber, msg), (_, count, terminate) => {
                    if (count <= maxTrials) {
                        logger.warn(`retry sending to ${subscriber.chatID} for the ${ordinal(count)} time...`);
                    }
                    else {
                        logger.warn(`${count - 1} consecutive failures while sending` +
                            'message chain, trying plain text instead...');
                        terminate(this.bot.sendTo(subscriber, text));
                    }
                });
            });
        };
        this.getFleets = (userID) => new Promise((resolve, reject) => {
            const endpoint = `https://api.twitter.com/fleets/v1/user_fleets?user_id=${userID}`;
            this.privateClient.get(endpoint, (error, fleetFeed, _) => {
                if (error)
                    reject(error);
                else
                    resolve(fleetFeed);
            });
        });
        this.work = () => {
            const lock = this.lock;
            if (this.workInterval < 1)
                this.workInterval = 1;
            if (lock.feed.length === 0) {
                setTimeout(() => {
                    this.work();
                }, this.workInterval * 1000);
                return;
            }
            if (lock.workon >= lock.feed.length)
                lock.workon = 0;
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
            let user;
            let match = currentFeed.match(/https:\/\/twitter.com\/([^\/]+)/);
            if (match)
                match = lock.threads[currentFeed].permaFeed.match(/https:\/\/twitter.com\/i\/user\/([^\/]+)/);
            if (!match) {
                logger.error(`cannot get endpoint for feed ${currentFeed}`);
                return;
            }
            this.client.get('users/show', { user_id: match[1] })
                .then((fullUser) => { user = fullUser; return this.getFleets(match[1]); })
                .catch(error => {
                logger.error(`unhandled error on fetching fleets for ${currentFeed}: ${JSON.stringify(error)}`);
            })
                .then((fleetFeed) => {
                logger.debug(`private api returned ${JSON.stringify(fleetFeed)} for feed ${currentFeed}`);
                logger.debug(`api returned ${JSON.stringify(user)} for owner of feed ${currentFeed}`);
                const currentThread = lock.threads[currentFeed];
                const updateDate = () => currentThread.updatedAt = new Date().toString();
                if (!fleetFeed || fleetFeed.fleet_threads.length === 0) {
                    updateDate();
                    return;
                }
                let fleets = fleetFeed.fleet_threads[0].fleets;
                const bottomOfFeed = fleets.slice(-1)[0].fleet_id.substring(3);
                const updateOffset = () => currentThread.offset = bottomOfFeed;
                if (currentThread.offset === '-1') {
                    updateOffset();
                    return;
                }
                if (currentThread.offset !== '0') {
                    const readCount = fleets.findIndex(fleet => Number(utils_1.BigNumOps.plus(fleet.fleet_id.substring(3), `-${currentThread.offset}`)) > 0);
                    if (readCount === -1)
                        return;
                    fleets = fleets.slice(readCount);
                }
                return this.workOnFleets(user, fleets, this.sendFleets(`thread ${currentFeed}`, ...currentThread.subscribers))
                    .then(updateDate).then(updateOffset);
            })
                .then(() => {
                lock.workon++;
                let timeout = this.workInterval * 1000 / lock.feed.length;
                if (timeout < 1000)
                    timeout = 1000;
                fs.writeFileSync(path.resolve(this.lockfile), JSON.stringify(lock));
                setTimeout(() => {
                    this.work();
                }, timeout);
            });
        };
        this.client = new Twitter({
            consumer_key: opt.consumer_key,
            consumer_secret: opt.consumer_secret,
            access_token_key: opt.access_token_key,
            access_token_secret: opt.access_token_secret,
        });
        this.privateClient = new Twitter({
            bearer_token: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        });
        this.privateClient.request = request.defaults({
            headers: Object.assign(Object.assign({}, this.privateClient.options.request_options.headers), { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: `auth_token=${opt.private_auth_token}; ct0=${opt.private_csrf_token};`, 'X-CSRF-Token': opt.private_csrf_token }),
        });
        this.lockfile = opt.lockfile;
        this.lock = opt.lock;
        this.workInterval = opt.workInterval;
        this.bot = opt.bot;
        this.mode = opt.mode;
        ScreenNameNormalizer._queryUser = this.queryUser;
        exports.sendAllFleets = (username, receiver) => {
            this.client.get('users/show', { screen_name: username })
                .then((user) => {
                const feed = `https://twitter.com/${user.screen_name}`;
                return this.getFleets(user.id_str)
                    .catch(error => {
                    logger.error(`unhandled error while fetching fleets for ${feed}: ${JSON.stringify(error)}`);
                    this.bot.sendTo(receiver, `获取 Fleets 时出现错误：${error}`);
                })
                    .then((fleetFeed) => {
                    if (!fleetFeed || fleetFeed.fleet_threads.length === 0) {
                        this.bot.sendTo(receiver, `当前用户（@${user.screen_name}）没有可用的 Fleets。`);
                        return;
                    }
                    this.workOnFleets(user, fleetFeed.fleet_threads[0].fleets, this.sendFleets(`thread ${feed}`, receiver));
                });
            })
                .catch((err) => {
                if (err[0].code !== 50) {
                    logger.warn(`error looking up user: ${err[0].message}, unable to fetch fleets`);
                }
                this.bot.sendTo(receiver, `找不到用户 ${username.replace(/^@?(.*)$/, '@$1')}。`);
            });
        };
    }
}
exports.default = default_1;
