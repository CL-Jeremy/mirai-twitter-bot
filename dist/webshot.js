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
const html_entities_1 = require("html-entities");
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
                                return { mimetype: 'image/gif', data: yield gif(data) };
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
        this.mode = mode;
        onready();
    }
    webshot(user, fleets, uploader, callback, webshotDelay) {
        let promise = new Promise(resolve => {
            resolve();
        });
        fleets.forEach(fleet => {
            var _a, _b;
            promise = promise.then(() => {
                logger.info(`working on ${user.screen_name}/${fleet.fleet_id}`);
            });
            const messageChain = [];
            // text processing
            const author = `${user.name} (@${user.screen_name}):\n`;
            const date = `${new Date(fleet.created_at)}\n`;
            let text = (_b = author + date + ((_a = fleet.media_bounding_boxes) === null || _a === void 0 ? void 0 : _a.map(box => box.entity.value).join('\n'))) !== null && _b !== void 0 ? _b : '';
            messageChain.push(mirai_1.Message.Plain(author + date));
            // fetch extra entities
            // tslint:disable-next-line: curly
            if (1 - this.mode % 2)
                promise = promise.then(() => {
                    const media = fleet.media_entity;
                    let url;
                    if (fleet.media_key.media_category === 'TWEET_IMAGE') {
                        media.type = 'photo';
                        url = media.media_url_https.replace(/\.([a-z]+)$/, '?format=$1') + '&name=orig';
                    }
                    else {
                        media.type = fleet.media_key.media_category === 'TWEET_VIDEO' ? 'video' : 'animated_gif';
                        media.video_info = media.media_info.video_info;
                        text += `[${typeInZH[media.type].type}]`;
                        url = media.video_info.variants // bitrate -> bit_rate
                            .filter(variant => variant.bit_rate !== undefined)
                            .sort((var1, var2) => var2.bit_rate - var1.bit_rate)
                            .map(variant => variant.url)[0]; // largest video
                    }
                    const altMessage = mirai_1.Message.Plain(`\n[失败的${typeInZH[media.type].type}：${url}]`);
                    return this.fetchMedia(url)
                        .then(base64url => uploader(mirai_1.Message.Image('', base64url, media.type === 'photo' ? url : `${url} as gif`), () => altMessage))
                        .catch(error => {
                        logger.warn('unable to fetch media, sending plain text instead...');
                        return altMessage;
                    })
                        .then(msg => {
                        messageChain.push(msg);
                    });
                });
            promise.then(() => {
                logger.info(`done working on ${user.screen_name}/${fleet.fleet_id}, message chain:`);
                logger.info(JSON.stringify(messageChain));
                callback(messageChain, xmlEntities.decode(text));
            });
        });
        return promise;
    }
}
exports.default = Webshot;
