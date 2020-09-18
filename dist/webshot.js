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
const axios_1 = require("axios");
const CallableInstance = require("callable-instance");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const html_entities_1 = require("html-entities");
const pngjs_1 = require("pngjs");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const temp = require("temp");
const util_1 = require("util");
const gifski_1 = require("./gifski");
const loggers_1 = require("./loggers");
const mirai_1 = require("./mirai");
const utils_1 = require("./utils");
const xmlEntities = new html_entities_1.XmlEntities();
const ZHType = (type) => new class extends String {
    constructor() {
        super(...arguments);
        this.type = super.toString();
        this.toString = () => `[${super.toString()}]`;
    }
}(type);
const typeInZH = {
    photo: ZHType('图片'),
    video: ZHType('视频'),
    animated_gif: ZHType('GIF'),
};
const logger = loggers_1.getLogger('webshot');
class Webshot extends CallableInstance {
    constructor(mode, onready) {
        super('webshot');
        // use local Chromium
        this.connect = (onready) => puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' })
            .then(browser => this.browser = browser)
            .then(() => {
            logger.info('launched puppeteer browser');
            if (onready)
                return onready();
        })
            .catch(error => this.reconnect(error, onready));
        this.reconnect = (error, onready) => {
            logger.error(`connection error, reason: ${error}`);
            logger.warn('trying to reconnect in 2.5s...');
            return util_1.promisify(setTimeout)(2500)
                .then(() => this.connect(onready));
        };
        this.extendEntity = (media) => {
            logger.info('not working on a tweet');
        };
        this.renderWebshot = (url, height, webshotDelay) => {
            const jpeg = (data) => data.pipe(sharp()).jpeg({ quality: 90, trellisQuantisation: true });
            const sharpToBase64 = (pic) => new Promise(resolve => {
                pic.toBuffer().then(buffer => resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`));
            });
            const promise = new Promise((resolve, reject) => {
                const width = 720;
                const zoomFactor = 2;
                logger.info(`shooting ${width}*${height} webshot for ${url}`);
                this.browser.newPage()
                    .then(page => {
                    const startTime = new Date().getTime();
                    const getTimerTime = () => new Date().getTime() - startTime;
                    const getTimeout = () => Math.max(500, webshotDelay - getTimerTime());
                    page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36')
                        .then(() => page.setViewport({
                        width: width / zoomFactor,
                        height: height / zoomFactor,
                        isMobile: true,
                        deviceScaleFactor: zoomFactor,
                    }))
                        .then(() => page.setBypassCSP(true))
                        .then(() => page.goto(url, { waitUntil: 'load', timeout: getTimeout() }))
                        // hide header, "more options" button, like and retweet count
                        .then(() => page.addStyleTag({
                        content: 'header{display:none!important}path[d=\'M20.207 7.043a1 1 0 0 0-1.414 0L12 13.836 5.207 7.043a1 1 0 0 0-1.414 1.414l7.5 7.5a.996.996 0 0 0 1.414 0l7.5-7.5a1 1 0 0 0 0-1.414z\'],div[role=\'button\']{display: none;}',
                    }))
                        // remove listeners
                        .then(() => page.evaluate(() => {
                        const poll = setInterval(() => {
                            document.querySelectorAll('div[data-testid="placementTracking"]').forEach(container => {
                                if (container) {
                                    container.innerHTML = container.innerHTML;
                                    clearInterval(poll);
                                }
                            });
                        }, 250);
                    }))
                        .then(() => page.waitForSelector('article', { timeout: getTimeout() }))
                        .catch((err) => {
                        if (err.name !== 'TimeoutError')
                            throw err;
                        logger.warn(`navigation timed out at ${getTimerTime()} seconds`);
                        return null;
                    })
                        .then(handle => {
                        if (handle === null)
                            throw new puppeteer.errors.TimeoutError();
                    })
                        .then(() => page.evaluate(() => {
                        const cardImg = document.querySelector('div[data-testid^="card.layout"][data-testid$=".media"] img');
                        if (typeof (cardImg === null || cardImg === void 0 ? void 0 : cardImg.getAttribute('src')) === 'string') {
                            const match = cardImg === null || cardImg === void 0 ? void 0 : cardImg.getAttribute('src').match(/^(.*\/card_img\/(\d+)\/.+\?format=.*)&name=/);
                            if (match) {
                                // tslint:disable-next-line: variable-name
                                const [media_url_https, id_str] = match.slice(1);
                                return {
                                    media_url: media_url_https.replace(/^https/, 'http'),
                                    media_url_https,
                                    url: '',
                                    display_url: '',
                                    expanded_url: '',
                                    type: 'photo',
                                    id: Number(id_str),
                                    id_str,
                                    sizes: undefined,
                                };
                            }
                        }
                    }))
                        .then(cardImg => { if (cardImg)
                        this.extendEntity(cardImg); })
                        .then(() => page.addScriptTag({
                        content: 'document.documentElement.scrollTop=0;',
                    }))
                        .then(() => util_1.promisify(setTimeout)(getTimeout()))
                        .then(() => page.screenshot())
                        .then(screenshot => {
                        new pngjs_1.PNG({
                            filterType: 4,
                            deflateLevel: 0,
                        }).on('parsed', function () {
                            // remove comment area
                            // tslint:disable-next-line: no-shadowed-variable
                            const idx = (x, y) => (this.width * y + x) << 2;
                            let boundary = null;
                            let x = zoomFactor * 2;
                            for (let y = 0; y < this.height; y++) {
                                if (this.data[idx(x, y)] !== 255 &&
                                    this.data[idx(x, y)] === this.data[idx(x + zoomFactor * 10, y)]) {
                                    if (this.data[idx(x, y + 18 * zoomFactor)] !== 255) {
                                        // footer kicks in
                                        boundary = null;
                                    }
                                    else {
                                        boundary = y;
                                    }
                                    break;
                                }
                            }
                            if (boundary !== null) {
                                logger.info(`found boundary at ${boundary}, cropping image`);
                                this.data = this.data.slice(0, idx(this.width, boundary));
                                this.height = boundary;
                                boundary = null;
                                x = Math.floor(16 * zoomFactor);
                                let flag = false;
                                let cnt = 0;
                                for (let y = this.height - 1; y >= 0; y--) {
                                    if ((this.data[idx(x, y)] === 255) === flag) {
                                        cnt++;
                                        flag = !flag;
                                    }
                                    else
                                        continue;
                                    // line above the "comment", "retweet", "like", "share" button row
                                    if (cnt === 2) {
                                        boundary = y + 1;
                                    }
                                    // if there are a "retweet" count and "like" count row, this will be the line above it
                                    if (cnt === 4) {
                                        const b = y + 1;
                                        if (this.height - boundary - (boundary - b) <= 1) {
                                            boundary = b;
                                            //   }
                                            // }
                                            // // if "retweet" count and "like" count are two rows, this will be the line above the first
                                            // if (cnt === 6) {
                                            //   const c = y + 1;
                                            //   if (this.height - boundary - 2 * (boundary - c) <= 2) {
                                            //     boundary = c;
                                            break;
                                        }
                                    }
                                }
                                if (boundary != null) {
                                    logger.info(`found boundary at ${boundary}, trimming image`);
                                    this.data = this.data.slice(0, idx(this.width, boundary));
                                    this.height = boundary;
                                }
                                sharpToBase64(jpeg(this.pack())).then(base64 => {
                                    logger.info(`finished webshot for ${url}`);
                                    resolve({ base64, boundary });
                                });
                            }
                            else if (height >= 8 * 1920) {
                                logger.warn('too large, consider as a bug, returning');
                                sharpToBase64(jpeg(this.pack())).then(base64 => {
                                    resolve({ base64, boundary: 0 });
                                });
                            }
                            else {
                                logger.info('unable to find boundary, try shooting a larger image');
                                resolve({ base64: '', boundary });
                            }
                        }).parse(screenshot);
                    })
                        .catch(err => {
                        if (err.name !== 'TimeoutError')
                            throw err;
                        logger.error(`error shooting webshot for ${url}, could not load web page of tweet`);
                        resolve({ base64: '', boundary: 0 });
                    })
                        .finally(() => page.close());
                })
                    .catch(reject);
            });
            return promise.then(data => {
                if (data.boundary === null)
                    return this.renderWebshot(url, height + 1920, webshotDelay);
                else
                    return data.base64;
            }).catch(error => new Promise(resolve => this.reconnect(error, resolve))
                .then(() => this.renderWebshot(url, height, webshotDelay)));
        };
        this.fetchMedia = (url) => {
            const gif = (data) => {
                const matchDims = url.match(/\/(\d+)x(\d+)\//);
                if (matchDims) {
                    const [width, height] = matchDims.slice(1).map(Number);
                    const factor = width + height > 1600 ? 0.375 : 0.5;
                    return gifski_1.default(data, width * factor);
                }
                return gifski_1.default(data);
            };
            return new Promise((resolve, reject) => {
                logger.info(`fetching ${url}`);
                axios_1.default({
                    method: 'get',
                    url,
                    responseType: 'arraybuffer',
                    timeout: 150000,
                }).then(res => {
                    if (res.status === 200) {
                        logger.info(`successfully fetched ${url}`);
                        resolve(res.data);
                    }
                    else {
                        logger.error(`failed to fetch ${url}: ${res.status}`);
                        reject();
                    }
                }).catch(err => {
                    logger.error(`failed to fetch ${url}: ${err.message}`);
                    reject();
                });
            }).then(data => {
                var _a;
                return ((ext) => __awaiter(this, void 0, void 0, function* () {
                    switch (ext) {
                        case 'jpg':
                            return { mimetype: 'image/jpeg', data };
                        case 'png':
                            return { mimetype: 'image/png', data };
                        case 'mp4':
                            try {
                                return { mimetype: 'video/x-matroska', data: yield gif(data) };
                            }
                            catch (err) {
                                logger.error(err);
                                throw Error(err);
                            }
                    }
                }))(((_a = url.match(/\?format=([a-z]+)&/)) !== null && _a !== void 0 ? _a : url.match(/.*\/.*\.([^?]+)/))[1])
                    .catch(() => {
                    logger.warn('unable to find MIME type of fetched media, failing this fetch');
                    throw Error();
                });
            }).then(typedData => `data:${typedData.mimetype};base64,${Buffer.from(typedData.data).toString('base64')}`);
        };
        // tslint:disable-next-line: no-conditional-assignment
        if (this.mode = mode) {
            onready();
        }
        else {
            this.connect(onready);
        }
    }
    webshot(tweets, uploader, callback, webshotDelay) {
        let promise = new Promise(resolve => {
            resolve();
        });
        tweets.forEach(twi => {
            promise = promise.then(() => {
                logger.info(`working on ${twi.user.screen_name}/${twi.id_str}`);
            });
            const originTwi = twi;
            const messageChain = [];
            // text processing
            const author = `${twi.user.name} (@${twi.user.screen_name}):\n`;
            let text = originTwi.full_text;
            promise = promise.then(() => {
                if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
                    originTwi.entities.urls.forEach(url => {
                        text = text.replace(new RegExp(url.url, 'gm'), url.expanded_url);
                    });
                }
                if (originTwi.extended_entities) {
                    originTwi.extended_entities.media.forEach(media => {
                        text = text.replace(new RegExp(media.url, 'gm'), this.mode === 1 ? typeInZH[media.type] : '');
                    });
                }
                if (this.mode > 0)
                    messageChain.push(mirai_1.Message.Plain(author + xmlEntities.decode(text)));
            });
            // invoke webshot
            if (this.mode === 0) {
                const url = `https://mobile.twitter.com/${twi.user.screen_name}/status/${twi.id_str}`;
                this.extendEntity = (cardImg) => {
                    var _a, _b;
                    originTwi.extended_entities = Object.assign(Object.assign({}, originTwi.extended_entities), { media: [
                            ...(_b = (_a = originTwi.extended_entities) === null || _a === void 0 ? void 0 : _a.media) !== null && _b !== void 0 ? _b : [],
                            cardImg,
                        ] });
                };
                promise = promise.then(() => this.renderWebshot(url, 1920, webshotDelay))
                    .then(base64url => {
                    if (base64url)
                        return uploader(mirai_1.Message.Image('', base64url, url), () => mirai_1.Message.Plain(author + text));
                    return mirai_1.Message.Plain(author + text);
                })
                    .then(msg => {
                    if (msg)
                        messageChain.push(msg);
                });
            }
            // fetch extra entities
            // tslint:disable-next-line: curly
            if (1 - this.mode % 2)
                promise = promise.then(() => {
                    if (originTwi.extended_entities) {
                        return utils_1.chainPromises(originTwi.extended_entities.media.map(media => {
                            let url;
                            if (media.type === 'photo') {
                                url = media.media_url_https.replace(/\.([a-z]+)$/, '?format=$1') + '&name=orig';
                            }
                            else {
                                url = media.video_info.variants
                                    .filter(variant => variant.bitrate !== undefined)
                                    .sort((var1, var2) => var2.bitrate - var1.bitrate)
                                    .map(variant => variant.url)[0]; // largest video
                            }
                            const altMessage = mirai_1.Message.Plain(`\n[失败的${typeInZH[media.type].type}：${url}]`);
                            return this.fetchMedia(url)
                                .then(base64url => {
                                let mediaPromise = Promise.resolve([]);
                                if (base64url.match(/^data:video.+;/)) {
                                    // demux mkv into gif and pcm16le
                                    const input = () => Buffer.from(base64url.split(',')[1], 'base64');
                                    const imgReturns = child_process_1.spawnSync('ffmpeg', [
                                        '-i', '-',
                                        '-an',
                                        '-f', 'gif',
                                        '-c', 'copy',
                                        '-',
                                    ], { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, input: input() });
                                    const voiceReturns = child_process_1.spawnSync('ffmpeg', [
                                        '-i', '-',
                                        '-vn',
                                        '-f', 's16le',
                                        '-ac', '1',
                                        '-ar', '24000',
                                        '-',
                                    ], { stdio: 'pipe', maxBuffer: 16 * 1024 * 1024, input: input() });
                                    if (!imgReturns.stdout)
                                        throw Error(imgReturns.stderr.toString());
                                    base64url = `data:image/gif;base64,${imgReturns.stdout.toString('base64')}`;
                                    if (voiceReturns.stdout) {
                                        logger.info('video has an audio track, trying to convert it to voice...');
                                        temp.track();
                                        const inputFile = temp.openSync();
                                        fs_1.writeSync(inputFile.fd, voiceReturns.stdout);
                                        child_process_1.spawnSync('silk-encoder', [
                                            inputFile.path,
                                            inputFile.path + '.silk',
                                            '-tencent',
                                        ]);
                                        temp.cleanup();
                                        if (fs_1.existsSync(inputFile.path + '.silk')) {
                                            if (fs_1.statSync(inputFile.path + '.silk').size !== 0) {
                                                const audioBase64Url = `data:audio/silk-v3;base64,${fs_1.readFileSync(inputFile.path + '.silk').toString('base64')}`;
                                                mediaPromise = mediaPromise.then(chain => uploader(mirai_1.Message.Voice('', audioBase64Url, `${url} as amr`), () => mirai_1.Message.Plain('\n[失败的语音]'))
                                                    .then(msg => [msg, ...chain]));
                                            }
                                            fs_1.unlinkSync(inputFile.path + '.silk');
                                        }
                                    }
                                }
                                return mediaPromise.then(chain => uploader(mirai_1.Message.Image('', base64url, media.type === 'photo' ? url : `${url} as gif`), () => altMessage)
                                    .then(msg => [msg, ...chain]));
                            })
                                .catch(error => {
                                logger.error(`unable to fetch media, error: ${error}`);
                                logger.warn('unable to fetch media, sending plain text instead...');
                                return [altMessage];
                            })
                                .then(msgs => {
                                messageChain.push(...msgs);
                            });
                        }));
                    }
                });
            // append URLs, if any
            if (this.mode === 0) {
                if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
                    promise = promise.then(() => {
                        const urls = originTwi.entities.urls
                            .filter(urlObj => urlObj.indices[0] < originTwi.display_text_range[1])
                            .map(urlObj => `\n\ud83d\udd17 ${urlObj.expanded_url}`);
                        if (urls.length) {
                            messageChain.push(mirai_1.Message.Plain(urls.join('')));
                        }
                    });
                }
            }
            // refer to quoted tweet, if any
            if (originTwi.is_quote_status) {
                promise = promise.then(() => {
                    messageChain.push(mirai_1.Message.Plain(`\n回复此命令查看引用的推文：\n/twitterpic_view ${originTwi.quoted_status_permalink.expanded}`));
                });
            }
            promise.then(() => {
                logger.info(`done working on ${twi.user.screen_name}/${twi.id_str}, message chain:`);
                logger.info(JSON.stringify(messageChain));
                callback(messageChain, xmlEntities.decode(text), author);
            });
        });
        return promise;
    }
}
exports.default = Webshot;
