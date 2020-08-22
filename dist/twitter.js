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
exports.sendTweet = exports.bigNumPlus = exports.ScreenNameNormalizer = void 0;
const fs = require("fs");
const path = require("path");
const Twitter = require("twitter");
const loggers_1 = require("./loggers");
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
exports.bigNumPlus = (num1, num2) => {
    const split = (num) => num.replace(/^(-?)(\d+)(\d{15})$/, '$1$2,$1$3')
        .replace(/^([^,]*)$/, '0,$1').split(',')
        .map(Number);
    let [high, low] = [split(num1), split(num2)].reduce((a, b) => [a[0] + b[0], a[1] + b[1]]);
    const [highSign, lowSign] = [high, low].map(Math.sign);
    if (highSign === 0)
        return low.toString();
    if (highSign !== lowSign) {
        [high, low] = [high - highSign, low - lowSign * Math.pow(10, 15)];
    }
    else {
        [high, low] = [high + ~~(low / Math.pow(10, 15)), low % Math.pow(10, 15)];
    }
    return `${high}${Math.abs(low).toString().padStart(15, '0')}`;
};
exports.sendTweet = (id, receiver) => {
    throw Error();
};
const logger = loggers_1.getLogger('twitter');
const maxTrials = 3;
const uploadTimeout = 10000;
const retryInterval = 1500;
const ordinal = (n) => {
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
                        setOffset('-' + bottomOfFeed);
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
    }
}
exports.default = default_1;
