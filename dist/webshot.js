"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CallableInstance = require("callable-instance");
const html_entities_1 = require("html-entities");
const pngjs_1 = require("pngjs");
const puppeteer = require("puppeteer");
const sharp = require("sharp");
const gifski_1 = require("./gifski");
const loggers_1 = require("./loggers");
const mirai_1 = require("./mirai");
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
            return new Promise(resolve => setTimeout(resolve, 2500))
                .then(() => this.connect(onready));
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
                    page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36')
                        .then(() => page.setViewport({
                        width: width / zoomFactor,
                        height: height / zoomFactor,
                        isMobile: true,
                        deviceScaleFactor: zoomFactor,
                    }))
                        .then(() => page.setBypassCSP(true))
                        .then(() => page.goto(url, { waitUntil: 'load', timeout: 150000 }))
                        // hide header, "more options" button, like and retweet count
                        .then(() => page.addStyleTag({
                        content: 'header{display:none!important}path[d=\'M20.207 7.043a1 1 0 0 0-1.414 0L12 13.836 5.207 7.043a1 1 0 0 0-1.414 1.414l7.5 7.5a.996.996 0 0 0 1.414 0l7.5-7.5a1 1 0 0 0 0-1.414z\'],div[role=\'button\']{display: none;}',
                    }))
                        .then(() => page.waitFor(webshotDelay))
                        .then(() => page.addScriptTag({
                        content: 'document.documentElement.scrollTop=0;',
                    }))
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
                                if (this.data[idx(x, y)] !== 255) {
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
                        .then(() => page.close());
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
        this.fetchMedia = (url) => new Promise(resolve => {
            logger.info(`fetching ${url}`);
            axios_1.default({
                method: 'get',
                url,
                responseType: 'arraybuffer',
            }).then(res => {
                if (res.status === 200) {
                    logger.info(`successfully fetched ${url}`);
                    resolve(res.data);
                }
                else {
                    logger.error(`failed to fetch ${url}: ${res.status}`);
                    resolve();
                }
            }).catch(err => {
                logger.error(`failed to fetch ${url}: ${err.message}`);
                resolve();
            });
        }).then(data => {
            const mimetype = (ext => {
                switch (ext) {
                    case 'jpg':
                        return 'image/jpeg';
                    case 'png':
                        return 'image/png';
                    case 'mp4':
                        const dims = url.match(/\/(\d+)x(\d+)\//).slice(1).map(Number);
                        const factor = dims.some(x => x >= 960) ? 0.375 : 0.5;
                        data = gifski_1.default(data, dims[0] * factor);
                        return 'image/gif';
                }
            })(url.split('/').slice(-1)[0].match(/\.([^:?&]+)/)[1]);
            return `data:${mimetype};base64,${Buffer.from(data).toString('base64')}`;
        });
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
                promise = promise.then(() => this.renderWebshot(url, 1920, webshotDelay))
                    .then(base64url => {
                    if (base64url) {
                        return uploader(mirai_1.Message.Image('', base64url, url), () => mirai_1.Message.Plain(author + text));
                    }
                })
                    .then(msg => {
                    if (msg)
                        messageChain.push(msg);
                });
            }
            // fetch extra entities
            if (1 - this.mode % 2) {
                if (originTwi.extended_entities) {
                    originTwi.extended_entities.media.forEach(media => {
                        let url;
                        if (media.type === 'photo') {
                            url = media.media_url_https + ':orig';
                        }
                        else {
                            url = media.video_info.variants
                                .filter(variant => variant.bitrate)
                                .sort((var1, var2) => var2.bitrate - var1.bitrate)
                                .map(variant => variant.url)[0]; // largest video
                        }
                        const altMessage = mirai_1.Message.Plain(`[失败的${typeInZH[media.type].type}：${url}]`);
                        promise = promise.then(() => this.fetchMedia(url))
                            .then(base64url => uploader(mirai_1.Message.Image('', base64url, media.type === 'photo' ? url : `${url} as gif`), () => altMessage))
                            .catch(error => {
                            logger.warn('unable to fetch media, sending plain text instead...');
                            return altMessage;
                        })
                            .then(msg => {
                            messageChain.push(msg);
                        });
                    });
                }
            }
            // append URLs, if any
            if (this.mode === 0) {
                if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
                    promise = promise.then(() => {
                        const urls = originTwi.entities.urls
                            .filter(urlObj => urlObj.indices[0] < originTwi.display_text_range[1])
                            .map(urlObj => urlObj.expanded_url);
                        if (urls.length) {
                            messageChain.push(mirai_1.Message.Plain(urls.join('\n')));
                        }
                    });
                }
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
