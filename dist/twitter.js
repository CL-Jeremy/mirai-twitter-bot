"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const path = require("path");
const Twitter = require("twitter");
const loggers_1 = require("./loggers");
const mirai_1 = require("./mirai");
const webshot_1 = require("./webshot");
const logger = loggers_1.getLogger('twitter');
class default_1 {
    constructor(opt) {
        this.launch = () => {
            this.webshot = new webshot_1.default(this.webshotOutDir, this.mode, () => setTimeout(this.work, this.workInterval * 1000));
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
                    config = {
                        owner_screen_name: match[1],
                        slug: match[2],
                        tweet_mode: 'extended',
                    };
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
                const updateOffset = () => currentThread.offset = topOfFeed;
                if (currentThread.offset === '-1') {
                    updateOffset();
                    return;
                }
                if (currentThread.offset === '0')
                    tweets.splice(1);
                const maxCount = 3;
                let sendTimeout = 10000;
                const retryTimeout = 1500;
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
                const sendTweets = (msg, text, author) => {
                    currentThread.subscribers.forEach(subscriber => {
                        logger.info(`pushing data of thread ${currentFeed} to ${JSON.stringify(subscriber)}`);
                        const retry = (reason, count) => {
                            if (count <= maxCount)
                                sendTimeout *= (count + 2) / (count + 1);
                            setTimeout(() => {
                                msg.forEach((message, pos) => {
                                    if (count > maxCount && message.type === 'Image') {
                                        if (pos === 0) {
                                            logger.warn(`${count - 1} consecutive failures sending webshot, trying plain text instead...`);
                                            msg[pos] = mirai_1.Message.Plain(author + text);
                                        }
                                        else {
                                            msg[pos] = mirai_1.Message.Plain(`[失败的图片：${message.path}]`);
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
                return this.webshot(tweets, sendTweets, this.webshotDelay).then(updateDate).then(updateOffset);
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
        this.webshotOutDir = opt.webshotOutDir;
        this.mode = opt.mode;
    }
}
exports.default = default_1;
