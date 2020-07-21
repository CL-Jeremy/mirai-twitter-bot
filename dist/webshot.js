"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CallableInstance = require("callable-instance");
const fs_1 = require("fs");
const html_entities_1 = require("html-entities");
const pngjs_1 = require("pngjs");
const puppeteer = require("puppeteer");
const loggers_1 = require("./loggers");
const mirai_1 = require("./mirai");
const writeOutTo = (path, data) => new Promise(resolve => {
    data.pipe(fs_1.createWriteStream(path)).on('close', () => resolve(path));
});
const xmlEntities = new html_entities_1.XmlEntities();
const typeInZH = {
    photo: '[图片]',
    video: '[视频]',
    animated_gif: '[GIF]',
};
const logger = loggers_1.getLogger('webshot');
const mkdirP = dir => { if (!fs_1.existsSync(dir))
    fs_1.mkdirSync(dir, { recursive: true }); };
const baseName = path => path.split(/[/\\]/).slice(-1)[0];
class Webshot extends CallableInstance {
    constructor(outDir, mode, onready) {
        super('webshot');
        this.renderWebshot = (url, height, webshotDelay) => {
            const writeOutPic = (pic) => writeOutTo(`${this.outDir}/${url.replace(/[:\/]/g, '_')}.png`, pic);
            const promise = new Promise(resolve => {
                const width = 600;
                logger.info(`shooting ${width}*${height} webshot for ${url}`);
                this.browser.newPage()
                    .then(page => {
                    page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36')
                        .then(() => page.setViewport({
                        width,
                        height,
                        isMobile: true,
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
                        }).on('parsed', function () {
                            // remove comment area
                            let boundary = null;
                            let x = 0;
                            for (let y = 0; y < this.height; y++) {
                                const idx = (this.width * y + x) << 2;
                                if (this.data[idx] !== 255) {
                                    boundary = y;
                                    break;
                                }
                            }
                            if (boundary !== null) {
                                logger.info(`found boundary at ${boundary}, cropping image`);
                                this.data = this.data.slice(0, (this.width * boundary) << 2);
                                this.height = boundary;
                                boundary = null;
                                x = Math.floor(this.width / 2);
                                let flag = false;
                                let cnt = 0;
                                for (let y = this.height - 1; y >= 0; y--) {
                                    const idx = (this.width * y + x) << 2;
                                    if ((this.data[idx] === 255) === flag) {
                                        cnt++;
                                        flag = !flag;
                                    }
                                    else
                                        continue;
                                    // line above the "comment", "retweet", "like", "share" button row
                                    if (cnt === 6) {
                                        boundary = y + 1;
                                    }
                                    // if there are a "retweet" count and "like" count row, this will be the line above it
                                    if (cnt === 8) {
                                        const b = y + 1;
                                        if (this.height - b <= 200)
                                            boundary = b;
                                        break;
                                    }
                                }
                                if (boundary != null) {
                                    logger.info(`found boundary at ${boundary}, trimming image`);
                                    this.data = this.data.slice(0, (this.width * boundary) << 2);
                                    this.height = boundary;
                                }
                                writeOutPic(this.pack()).then(data => {
                                    logger.info(`finished webshot for ${url}`);
                                    resolve({ data, boundary });
                                });
                            }
                            else if (height >= 8 * 1920) {
                                logger.warn('too large, consider as a bug, returning');
                                writeOutPic(this.pack()).then(data => {
                                    resolve({ data, boundary: 0 });
                                });
                            }
                            else {
                                logger.info('unable to find boundary, try shooting a larger image');
                                resolve({ data: '', boundary });
                            }
                        }).parse(screenshot);
                    })
                        .then(() => page.close());
                });
            });
            return promise.then(data => {
                if (data.boundary === null)
                    return this.renderWebshot(url, height + 1920, webshotDelay);
                else
                    return data.data;
            });
        };
        this.fetchImage = (url, tag) => new Promise(resolve => {
            logger.info(`fetching ${url}`);
            axios_1.default({
                method: 'get',
                url,
                responseType: 'stream',
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
        }).then(data => writeOutTo(`${this.outDir}/${tag}${baseName(url)}`, data));
        mkdirP(this.outDir = outDir);
        // tslint:disable-next-line: no-conditional-assignment
        if (this.mode = mode) {
            onready();
        }
        else {
            puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--lang=ja-JP,ja',
                ]
            })
                .then(browser => this.browser = browser)
                .then(() => {
                logger.info('launched puppeteer browser');
                if (onready)
                    onready();
            });
        }
    }
    webshot(tweets, callback, webshotDelay) {
        let promise = new Promise(resolve => {
            resolve();
        });
        tweets.forEach(twi => {
            promise = promise.then(() => {
                logger.info(`working on ${twi.user.screen_name}/${twi.id_str}`);
            });
            const originTwi = twi.retweeted_status || twi;
            const messageChain = [];
            // text processing
            let author = `${twi.user.name} (@${twi.user.screen_name}):\n`;
            if (twi.retweeted_status)
                author += `RT @${twi.retweeted_status.user.screen_name}: `;
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
                    messageChain.push(mirai_1.MiraiMessage.Plain(author + xmlEntities.decode(text)));
            });
            // invoke webshot
            if (this.mode === 0) {
                const url = `https://mobile.twitter.com/${twi.user.screen_name}/status/${twi.id_str}`;
                promise = promise.then(() => this.renderWebshot(url, 1920, webshotDelay))
                    .then(webshotFilePath => {
                    if (webshotFilePath)
                        messageChain.push(mirai_1.MiraiMessage.Image('', '', baseName(webshotFilePath)));
                });
                // fetch extra images
            }
            else if (1 - this.mode % 2) {
                if (originTwi.extended_entities) {
                    originTwi.extended_entities.media.forEach(media => promise = promise.then(() => this.fetchImage(media.media_url_https, `${twi.user.screen_name}-${twi.id_str}--`)
                        .then(path => {
                        messageChain.push(mirai_1.MiraiMessage.Image('', '', baseName(path)));
                    })));
                }
                // append URLs, if any
            }
            else if (this.mode === 0) {
                if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
                    promise = promise.then(() => {
                        const urls = originTwi.entities.urls
                            .filter(urlObj => urlObj.indices[0] < originTwi.display_text_range[1])
                            .map(urlObj => urlObj.expanded_url);
                        if (urls.length) {
                            messageChain.push(mirai_1.MiraiMessage.Plain(urls.join('\n')));
                        }
                    });
                }
            }
            promise.then(() => {
                logger.info(`done working on ${twi.user.screen_name}/${twi.id_str}, message chain:`);
                logger.info(JSON.stringify(messageChain));
                callback(messageChain, text, author);
            });
        });
        return promise;
    }
}
exports.default = Webshot;
