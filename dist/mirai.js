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
exports.Message = void 0;
const axios_1 = require("axios");
const fs_1 = require("fs");
const mirai_ts_1 = require("mirai-ts");
const message_1 = require("mirai-ts/dist/message");
const temp = require("temp");
const command_1 = require("./command");
const loggers_1 = require("./loggers");
const logger = loggers_1.getLogger('qqbot');
exports.Message = message_1.default;
class default_1 {
    constructor(opt) {
        this.getChat = (msg) => __awaiter(this, void 0, void 0, function* () {
            switch (msg.type) {
                case 'FriendMessage':
                    return {
                        chatID: msg.sender.id,
                        chatType: "private" /* Private */,
                    };
                case 'GroupMessage':
                    return {
                        chatID: msg.sender.group.id,
                        chatType: "group" /* Group */,
                    };
                case 'TempMessage':
                    const friendList = yield this.bot.api.friendList();
                    // already befriended
                    if (friendList.some(friendItem => friendItem.id === msg.sender.id)) {
                        return {
                            chatID: msg.sender.id,
                            chatType: "private" /* Private */,
                        };
                    }
                    return {
                        chatID: {
                            qq: msg.sender.id,
                            group: msg.sender.group.id,
                        },
                        chatType: "temp" /* Temp */,
                    };
            }
        });
        this.sendTo = (subscriber, msg) => (() => {
            switch (subscriber.chatType) {
                case 'group':
                    return this.bot.api.sendGroupMessage(msg, subscriber.chatID);
                case 'private':
                    return this.bot.api.sendFriendMessage(msg, subscriber.chatID);
                // currently disabled
                case 'temp':
                    return this.bot.api.sendTempMessage(msg, subscriber.chatID.qq, subscriber.chatID.group);
            }
        })()
            .then(response => {
            logger.info(`pushing data to ${JSON.stringify(subscriber.chatID)} was successful, response:`);
            logger.info(response);
        })
            .catch(reason => {
            logger.error(`error pushing data to ${JSON.stringify(subscriber.chatID)}, reason: ${reason}`);
            throw Error(reason);
        });
        this.uploadPic = (img, timeout = -1) => {
            if (timeout)
                timeout = Math.floor(timeout);
            if (timeout === 0 || timeout < -1) {
                return Promise.reject('Error: timeout must be greater than 0ms');
            }
            let imgFile;
            if (img.imageId !== '')
                return Promise.resolve();
            if (img.url !== '') {
                if (img.url.split(':')[0] !== 'data') {
                    return Promise.reject('Error: URL must be of protocol "data"');
                }
                if (img.url.split(',')[0].split(';')[1] !== 'base64') {
                    return Promise.reject('Error: data URL must be of encoding "base64"');
                }
                temp.track();
                try {
                    const tempFile = temp.openSync();
                    fs_1.writeSync(tempFile.fd, Buffer.from(img.url.split(',')[1], 'base64'));
                    fs_1.closeSync(tempFile.fd);
                    imgFile = tempFile.path;
                }
                catch (error) {
                    logger.error(error);
                }
            }
            try {
                this.bot.axios.defaults.timeout = timeout === -1 ? 0 : timeout;
                logger.info(`uploading ${JSON.stringify(exports.Message.Image(img.imageId, `${img.url.split(',')[0]},[...]`, img.path))}...`);
                return this.bot.api.uploadImage('group', imgFile || img.path)
                    .then(response => {
                    logger.info(`uploading ${img.path} as group image was successful, response:`);
                    logger.info(JSON.stringify(response));
                    img.url = '';
                    img.path = response.path.split(/[/\\]/).slice(-1)[0];
                })
                    .catch(reason => {
                    logger.error(`error uploading ${img.path}, reason: ${reason}`);
                    throw Error(reason);
                });
            }
            finally {
                temp.cleanup();
                this.bot.axios.defaults.timeout = 0;
            }
        };
        this.initBot = () => {
            this.bot = new mirai_ts_1.default({
                authKey: this.botInfo.access_token,
                enableWebsocket: false,
                host: this.botInfo.host,
                port: this.botInfo.port,
            });
            this.bot.axios.defaults.maxContentLength = Infinity;
            this.bot.on('NewFriendRequestEvent', evt => {
                logger.debug(`detected new friend request event: ${JSON.stringify(evt)}`);
                this.bot.api.groupList()
                    .then((groupList) => {
                    if (groupList.some(groupItem => groupItem.id === evt.groupId)) {
                        evt.respond('allow');
                        return logger.info(`accepted friend request from ${evt.fromId} (from group ${evt.groupId})`);
                    }
                    logger.warn(`received friend request from ${evt.fromId} (from group ${evt.groupId})`);
                    logger.warn('please manually accept this friend request');
                });
            });
            this.bot.on('BotInvitedJoinGroupRequestEvent', evt => {
                logger.debug(`detected group invitation event: ${JSON.stringify(evt)}`);
                this.bot.api.friendList()
                    .then((friendList) => {
                    if (friendList.some(friendItem => friendItem.id = evt.fromId)) {
                        evt.respond('allow');
                        return logger.info(`accepted group invitation from ${evt.fromId} (friend)`);
                    }
                    logger.warn(`received group invitation from ${evt.fromId} (unknown)`);
                    logger.warn('please manually accept this group invitation');
                });
            });
            this.bot.on('message', (msg) => __awaiter(this, void 0, void 0, function* () {
                const chat = yield this.getChat(msg);
                const cmdObj = command_1.parseCmd(msg.plain);
                switch (cmdObj.cmd) {
                    case 'twitter_view':
                    case 'twitter_get':
                        command_1.view(chat, cmdObj.args, msg.reply);
                        break;
                    case 'twitter_query':
                    case 'twitter_gettimeline':
                        command_1.query(chat, cmdObj.args, msg.reply);
                        break;
                    case 'twitter_sub':
                    case 'twitter_subscribe':
                        this.botInfo.sub(chat, cmdObj.args, msg.reply);
                        break;
                    case 'twitter_unsub':
                    case 'twitter_unsubscribe':
                        this.botInfo.unsub(chat, cmdObj.args, msg.reply);
                        break;
                    case 'ping':
                    case 'twitter':
                        this.botInfo.list(chat, cmdObj.args, msg.reply);
                        break;
                    case 'help':
                        if (cmdObj.args.length === 0) {
                            msg.reply(`推特搬运机器人：
/twitter - 查询当前聊天中的推文订阅
/twitter_subscribe〈链接|用户名〉- 订阅 Twitter 推文搬运
/twitter_unsubscribe〈链接|用户名〉- 退订 Twitter 推文搬运
/twitter_view〈链接〉- 查看推文
/twitter_query〈链接|用户名〉[参数列表...] - 查询时间线（详见 /help twitter_query）\
${chat.chatType === "temp" /* Temp */ ?
                                '\n（当前游客模式下无法使用订阅功能，请先添加本账号为好友。）' : ''}`);
                        }
                        else if (cmdObj.args[0] === 'twitter_query') {
                            msg.reply(`查询时间线中的推文：
/twitter_query〈链接|用户名〉[〈参数 1〉=〈值 1〉〈参数 2〉=〈值 2〉...]

参数列表（方框内全部为可选，留空则为默认）：
    count：查询数量上限（类型：非零整数，最大值正负 50）[默认值：10]
    since：查询起始点（类型：正整数或日期）[默认值：（空，无限过去）]
    until：查询结束点（类型：正整数或日期）[默认值：（空，当前时刻）]
    noreps 忽略回复推文（类型：on/off）[默认值：on（是）]
    norts：忽略原生转推（类型：on/off）[默认值：off（否）]`)
                                .then(() => msg.reply(`\
起始点和结束点为正整数时取推特推文编号作为比较基准，否则会尝试作为日期读取。
推荐的日期格式：2012-12-22 12:22 UTC+2 （日期和时间均为可选，可分别添加）
count 为正时，从新向旧查询；为负时，从旧向新查询
count 与 since/until 并用时，取二者中实际查询结果较少者
例子：/twitter_query RiccaTachibana count=5 since="2019-12-30\
 UTC+9" until="2020-01-06 UTC+8" norts=on
    从起始时间点（含）到结束时间点（不含）从新到旧获取最多 5 条推文，\
其中不包含原生转推（实际上用户只发了 1 条）`));
                        }
                }
            }));
        };
        // TODO doesn't work if connection is dropped after connection
        this.listen = (logMsg) => {
            if (logMsg !== '') {
                logger.warn(logMsg !== null && logMsg !== void 0 ? logMsg : 'Listening...');
            }
            axios_1.default.get(`http://${this.botInfo.host}:${this.botInfo.port}/about`)
                .then(() => __awaiter(this, void 0, void 0, function* () {
                if (logMsg !== '') {
                    this.bot.listen();
                    yield this.login();
                }
                setTimeout(() => this.listen(''), 5000);
            }))
                .catch(() => {
                logger.error(`Error connecting to bot provider at ${this.botInfo.host}:${this.botInfo.port}`);
                setTimeout(() => this.listen('Retry listening...'), 2500);
            });
        };
        this.login = (logMsg) => __awaiter(this, void 0, void 0, function* () {
            logger.warn(logMsg !== null && logMsg !== void 0 ? logMsg : 'Logging in...');
            yield this.bot.link(this.botInfo.bot_id)
                .then(() => logger.warn(`Logged in as ${this.botInfo.bot_id}`))
                .catch(() => {
                logger.error(`Cannot log in. Do you have a bot logged in as ${this.botInfo.bot_id}?`);
                setTimeout(() => this.login('Retry logging in...'), 2500);
            });
        });
        this.connect = () => {
            this.initBot();
            this.listen();
        };
        logger.warn(`Initialized mirai-ts for ${opt.host}:${opt.port} with access_token ${opt.access_token}`);
        this.botInfo = opt;
    }
}
exports.default = default_1;
