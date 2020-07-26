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
const mirai_ts_1 = require("mirai-ts");
const message_1 = require("mirai-ts/dist/message");
const helper_1 = require("./helper");
const loggers_1 = require("./loggers");
const logger = loggers_1.getLogger('qqbot');
const ChatTypeMap = {
    GroupMessage: "group" /* Group */,
    FriendMessage: "private" /* Private */,
    TempMessage: "temp" /* Temp */,
};
exports.MiraiMessage = message_1.default;
class default_1 {
    constructor(opt) {
        this.sendTo = (subscriber, msg, timeout = -1) => (() => {
            if (timeout)
                timeout = Math.floor(timeout);
            if (timeout === 0 || timeout < -1) {
                return Promise.reject('Error: timeout must be greater than 0ms');
            }
            try {
                this.bot.axios.defaults.timeout = timeout === -1 ? 0 : timeout;
                switch (subscriber.chatType) {
                    case 'group':
                        return this.bot.api.sendGroupMessage(msg, subscriber.chatID);
                    case 'private':
                        return this.bot.api.sendFriendMessage(msg, subscriber.chatID);
                }
            }
            finally {
                this.bot.axios.defaults.timeout = 0;
            }
        })()
            .then(response => {
            logger.info(`pushing data to ${subscriber.chatID} was successful, response:`);
            logger.info(response);
        })
            .catch(reason => {
            logger.error(`error pushing data to ${subscriber.chatID}, reason: ${reason}`);
            throw Error(reason);
        });
        this.initBot = () => {
            this.bot = new mirai_ts_1.default({
                authKey: this.botInfo.access_token,
                enableWebsocket: false,
                host: this.botInfo.host,
                port: this.botInfo.port,
            });
            this.bot.on('message', (msg) => {
                const chat = {
                    chatType: ChatTypeMap[msg.type],
                    chatID: 0,
                };
                if (msg.type === 'FriendMessage') {
                    chat.chatID = msg.sender.id;
                }
                else if (msg.type === 'GroupMessage') {
                    chat.chatID = msg.sender.group.id;
                }
                const cmdObj = helper_1.default(msg.plain);
                switch (cmdObj.cmd) {
                    case 'twitter_sub':
                    case 'twitter_subscribe':
                        msg.reply(this.botInfo.sub(chat, cmdObj.args));
                        break;
                    case 'twitter_unsub':
                    case 'twitter_unsubscribe':
                        msg.reply(this.botInfo.unsub(chat, cmdObj.args));
                        break;
                    case 'ping':
                    case 'twitter':
                        msg.reply(this.botInfo.list(chat, cmdObj.args));
                        break;
                    case 'help':
                        msg.reply(`推特搬运机器人：
/twitter - 查询当前聊天中的订阅
/twitter_subscribe [链接] - 订阅 Twitter 搬运
/twitter_unsubscribe [链接] - 退订 Twitter 搬运`);
                }
            });
        };
        // TODO doesn't work if connection is dropped after connection
        this.listen = (logMsg) => {
            if (logMsg !== '') {
                logger.warn((logMsg !== null && logMsg !== void 0 ? logMsg : 'Listening...'));
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
            logger.warn((logMsg !== null && logMsg !== void 0 ? logMsg : 'Logging in...'));
            yield this.bot.login(this.botInfo.bot_id)
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
