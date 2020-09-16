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
exports.sendTimeline = exports.sendTweet = exports.ScreenNameNormalizer = void 0;
const fs = require("fs");
const path = require("path");
const Twitter = require("twitter");
const loggers_1 = require("./loggers");
const utils_1 = require("./utils");
const webshot_1 = require("./webshot");
class ScreenNameNormalizer {
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
ScreenNameNormalizer.normalize = (username) => username.toLowerCase().replace(/^@/, '');
exports.sendTweet = (id, receiver) => {
    throw Error();
};
exports.sendTimeline = (conf, receiver) => {
    throw Error();
};
const TWITTER_EPOCH = 1288834974657;
const snowflake = (epoch) => Number.isNaN(epoch) ? undefined :
    utils_1.BigNumOps.lShift(String(epoch - 1 - TWITTER_EPOCH), 22);
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
            .then((user) => user.screen_name);
        this.queryTimelineReverse = (conf) => {
            if (!conf.since)
                return this.queryTimeline(conf);
            const count = conf.count;
            const maxID = conf.until;
            conf.count = undefined;
            const until = () => utils_1.BigNumOps.min(maxID, utils_1.BigNumOps.plus(conf.since, String(7 * 24 * 3600 * 1000 * Math.pow(2, 22))));
            conf.until = until();
            const promise = (tweets) => this.queryTimeline(conf).then(newTweets => {
                tweets = newTweets.concat(tweets);
                conf.since = conf.until;
                conf.until = until();
                if (tweets.length >= count ||
                    utils_1.BigNumOps.compare(conf.since, conf.until) >= 0) {
                    return tweets.slice(-count);
                }
                return promise(tweets);
            });
            return promise([]);
        };
        this.queryTimeline = ({ username, count, since, until, noreps, norts }) => {
            username = username.replace(/^@?(.*)$/, '@$1');
            logger.info(`querying timeline of ${username} with config: ${JSON.stringify(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (count && { count })), (since && { since })), (until && { until })), (noreps && { noreps })), (norts && { norts })))}`);
            const fetchTimeline = (config = {
                screen_name: username.slice(1),
                trim_user: true,
                exclude_replies: noreps !== null && noreps !== void 0 ? noreps : true,
                include_rts: !(norts !== null && norts !== void 0 ? norts : false),
                since_id: since,
                max_id: until,
                tweet_mode: 'extended',
            }, tweets = []) => this.client.get('statuses/user_timeline', config)
                .then((newTweets) => {
                if (newTweets.length) {
                    logger.debug(`fetched tweets: ${JSON.stringify(newTweets)}`);
                    config.max_id = utils_1.BigNumOps.plus('-1', newTweets[newTweets.length - 1].id_str);
                    logger.info(`timeline query of ${username} yielded ${newTweets.length} new tweets, next query will start at offset ${config.max_id}`);
                    tweets.push(...newTweets.filter(tweet => tweet.extended_entities));
                }
                if (!newTweets.length || tweets.length >= count) {
                    logger.info(`timeline query of ${username} finished successfully, ${tweets.length} tweets with extended entities have been fetched`);
                    return tweets.slice(0, count);
                }
                return fetchTimeline(config, tweets);
            });
            return fetchTimeline();
        };
        this.workOnTweets = (tweets, sendTweets) => {
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
            return this.webshot(tweets, uploader, sendTweets, this.webshotDelay);
        };
        this.getTweet = (id, sender) => {
            const endpoint = 'statuses/show';
            const config = {
                id,
                tweet_mode: 'extended',
            };
            return this.client.get(endpoint, config)
                .then((tweet) => {
                logger.debug(`api returned tweet ${JSON.stringify(tweet)} for query id=${id}`);
                return this.workOnTweets([tweet], sender);
            });
        };
        this.sendTweets = (source, ...to) => (msg, text, author) => {
            to.forEach(subscriber => {
                logger.info(`pushing data${source ? ` of ${source}` : ''} to ${JSON.stringify(subscriber)}`);
                retryOnError(() => this.bot.sendTo(subscriber, msg), (_, count, terminate) => {
                    if (count <= maxTrials) {
                        logger.warn(`retry sending to ${subscriber.chatID} for the ${ordinal(count)} time...`);
                    }
                    else {
                        logger.warn(`${count - 1} consecutive failures while sending` +
                            'message chain, trying plain text instead...');
                        terminate(this.bot.sendTo(subscriber, author + text));
                    }
                });
            });
        };
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
            const promise = new Promise(resolve => {
                let match = currentFeed.match(/https:\/\/twitter.com\/([^\/]+)\/lists\/([^\/]+)/);
                let config;
                let endpoint;
                if (match) {
                    if (match[1] === 'i') {
                        config = {
                            list_id: match[2],
                            tweet_mode: 'extended',
                        };
                    }
                    else {
                        config = {
                            owner_screen_name: match[1],
                            slug: match[2],
                            tweet_mode: 'extended',
                        };
                    }
                    endpoint = 'lists/statuses';
                }
                else {
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
                    const offset = lock.threads[currentFeed].offset;
                    if (offset > 0)
                        config.since_id = offset;
                    if (offset < -1)
                        config.max_id = offset.slice(1);
                    this.client.get(endpoint, config, (error, tweets, response) => {
                        if (error) {
                            if (error instanceof Array && error.length > 0 && error[0].code === 34) {
                                logger.warn(`error on fetching tweets for ${currentFeed}: ${JSON.stringify(error)}`);
                                lock.threads[currentFeed].subscribers.forEach(subscriber => {
                                    logger.info(`sending notfound message of ${currentFeed} to ${JSON.stringify(subscriber)}`);
                                    this.bot.sendTo(subscriber, `链接 ${currentFeed} 指向的用户或列表不存在，请退订。`).catch();
                                });
                            }
                            else {
                                logger.error(`unhandled error on fetching tweets for ${currentFeed}: ${JSON.stringify(error)}`);
                            }
                            resolve();
                        }
                        else
                            resolve(tweets);
                    });
                }
            });
            promise.then((tweets) => {
                logger.debug(`api returned ${JSON.stringify(tweets)} for feed ${currentFeed}`);
                const currentThread = lock.threads[currentFeed];
                const updateDate = () => currentThread.updatedAt = new Date().toString();
                if (!tweets || tweets.length === 0) {
                    updateDate();
                    return;
                }
                const topOfFeed = tweets[0].id_str;
                logger.info(`current offset: ${currentThread.offset}, current top of feed: ${topOfFeed}`);
                const bottomOfFeed = tweets[tweets.length - 1].id_str;
                const setOffset = (offset) => currentThread.offset = offset;
                const updateOffset = () => setOffset(topOfFeed);
                tweets = tweets.filter(twi => !twi.retweeted_status && twi.extended_entities);
                logger.info(`found ${tweets.length} tweets with extended entities`);
                if (currentThread.offset === '-1') {
                    updateOffset();
                    return;
                }
                if (currentThread.offset <= 0) {
                    if (tweets.length === 0) {
                        setOffset(utils_1.BigNumOps.plus('1', '-' + bottomOfFeed));
                        lock.workon--;
                        return;
                    }
                    tweets.splice(1);
                }
                if (tweets.length === 0) {
                    updateDate();
                    updateOffset();
                    return;
                }
                return this.workOnTweets(tweets, this.sendTweets(`thread ${currentFeed}`, ...currentThread.subscribers))
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
        this.lockfile = opt.lockfile;
        this.lock = opt.lock;
        this.workInterval = opt.workInterval;
        this.bot = opt.bot;
        this.webshotDelay = opt.webshotDelay;
        this.mode = opt.mode;
        ScreenNameNormalizer._queryUser = this.queryUser;
        exports.sendTweet = (id, receiver) => {
            this.getTweet(id, this.sendTweets(`tweet ${id}`, receiver))
                .catch((err) => {
                if (err[0].code !== 144) {
                    logger.warn(`error retrieving tweet: ${err[0].message}`);
                    this.bot.sendTo(receiver, `获取推文时出现错误：${err[0].message}`);
                }
                this.bot.sendTo(receiver, '找不到请求的推文，它可能已被删除。');
            });
        };
        exports.sendTimeline = ({ username, count, since, until, noreps, norts }, receiver) => {
            const countNum = Number(count) || 10;
            (countNum > 0 ? this.queryTimeline : this.queryTimelineReverse)({
                username,
                count: Math.abs(countNum),
                since: utils_1.BigNumOps.parse(since) || snowflake(new Date(since).getTime()),
                until: utils_1.BigNumOps.parse(until) || snowflake(new Date(until).getTime()),
                noreps: { on: true, off: false }[noreps],
                norts: { on: true, off: false }[norts],
            })
                .then(tweets => utils_1.chainPromises(tweets.map(tweet => this.bot.sendTo(receiver, `\
编号：${tweet.id_str}
时间：${tweet.created_at}
媒体：${tweet.extended_entities ? '有' : '无'}
正文：\n${tweet.full_text.replace(/^([\s\S\n]{50})[\s\S\n]+( https:\/\/t.co\/.*)$/, '$1…$2')}`))
                .concat(this.bot.sendTo(receiver, tweets.length ?
                '时间线查询完毕，使用 /twitterpic_view <编号> 查看媒体推文详细内容。' :
                '时间线查询完毕，没有找到符合条件的媒体推文。'))))
                .catch((err) => {
                var _a, _b, _c;
                if (((_a = err[0]) === null || _a === void 0 ? void 0 : _a.code) !== 34) {
                    logger.warn(`error retrieving timeline: ${((_b = err[0]) === null || _b === void 0 ? void 0 : _b.message) || err}`);
                    return this.bot.sendTo(receiver, `获取时间线时出现错误：${((_c = err[0]) === null || _c === void 0 ? void 0 : _c.message) || err}`);
                }
                this.bot.sendTo(receiver, `找不到用户 ${username.replace(/^@?(.*)$/, '@$1')}。`);
            });
        };
    }
}
exports.default = default_1;
