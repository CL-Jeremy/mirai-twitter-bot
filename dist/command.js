"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.view = exports.unsub = exports.list = exports.sub = void 0;
const fs = require("fs");
const path = require("path");
const datetime_1 = require("./datetime");
const loggers_1 = require("./loggers");
const twitter_1 = require("./twitter");
const logger = loggers_1.getLogger('command');
function parseLink(link) {
    let match = link.match(/twitter.com\/([^\/?#]+)\/lists\/([^\/?#]+)/) ||
        link.match(/^([^\/?#]+)\/([^\/?#]+)$/);
    if (match)
        return [match[1], `/lists/${match[2]}`];
    match =
        link.match(/twitter.com\/([^\/?#]+)\/status\/(\d+)/);
    if (match)
        return [match[1], `/status/${match[2]}`];
    match =
        link.match(/twitter.com\/([^\/?#]+)/) ||
            link.match(/^([^\/?#]+)$/);
    if (match)
        return [match[1]];
    return;
}
function linkBuilder(userName, more = '') {
    if (!userName)
        return;
    return `https://twitter.com/${userName}${more}`;
}
function linkFinder(checkedMatch, chat, lock) {
    var _a;
    const normalizedLink = linkBuilder(twitter_1.ScreenNameNormalizer.normalize(checkedMatch[0]), (_a = checkedMatch[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase());
    const link = Object.keys(lock.threads).find(realLink => normalizedLink === realLink.replace(/\/@/, '/').toLowerCase());
    if (!link)
        return [null, -1];
    const index = lock.threads[link].subscribers.findIndex(({ chatID, chatType }) => chat.chatID === chatID && chat.chatType === chatType);
    return [link, index];
}
function sub(chat, args, reply, lock, lockfile) {
    if (chat.chatType === "temp" /* Temp */) {
        return reply('请先添加机器人为好友。');
    }
    if (args.length === 0) {
        return reply('找不到要订阅媒体推文的链接。');
    }
    const match = parseLink(args[0]);
    if (!match) {
        return reply(`订阅链接格式错误：
示例：
https://twitter.com/Saito_Shuka
https://twitter.com/rikakomoe/lists/lovelive
https://twitter.com/TomoyoKurosawa/status/1294613494860361729`);
    }
    let offset = '0';
    if (match[1]) {
        const matchStatus = match[1].match(/\/status\/(\d+)/);
        if (matchStatus) {
            offset = twitter_1.bigNumPlus(matchStatus[1], '-1');
            delete match[1];
        }
    }
    const subscribeTo = (link, config = {}) => {
        const { addNew = false, msg = `已为此聊天订阅 ${link} 的媒体推文` } = config;
        if (addNew) {
            lock.feed.push(link);
            lock.threads[link] = {
                offset,
                subscribers: [],
                updatedAt: '',
            };
        }
        lock.threads[link].subscribers.push(chat);
        logger.warn(`chat ${JSON.stringify(chat)} has subscribed ${link}`);
        fs.writeFileSync(path.resolve(lockfile), JSON.stringify(lock));
        reply(msg);
    };
    const [realLink, index] = linkFinder(match, chat, lock);
    if (index > -1)
        return reply('此聊天已订阅此链接。');
    if (realLink)
        return subscribeTo(realLink);
    const [rawUserName, more] = match;
    if (rawUserName.toLowerCase() === 'i' && (more === null || more === void 0 ? void 0 : more.match(/lists\/(\d+)/))) {
        return subscribeTo(linkBuilder('i', more), { addNew: true });
    }
    twitter_1.ScreenNameNormalizer.normalizeLive(rawUserName).then(userName => {
        if (!userName)
            return reply(`找不到用户 ${rawUserName.replace(/^@?(.*)$/, '@$1')}。`);
        const link = linkBuilder(userName, more);
        const msg = (offset === '0') ?
            undefined :
            `已为此聊天订阅 ${link} 的媒体动态并回溯到此动态 ID（含）之后的第一条媒体动态。
（参见：https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake.html）`;
        subscribeTo(link, { addNew: true, msg });
    });
}
exports.sub = sub;
function unsub(chat, args, reply, lock, lockfile) {
    if (chat.chatType === "temp" /* Temp */) {
        return reply('请先添加机器人为好友。');
    }
    if (args.length === 0) {
        return reply('找不到要退订媒体推文的链接。');
    }
    const match = parseLink(args[0]);
    if (!match) {
        return reply('链接格式有误。');
    }
    const [link, index] = linkFinder(match, chat, lock);
    if (index === -1)
        return list(chat, args, msg => reply('您没有订阅此链接的媒体推文。\n' + msg), lock);
    else {
        lock.threads[link].subscribers.splice(index, 1);
        fs.writeFileSync(path.resolve(lockfile), JSON.stringify(lock));
        logger.warn(`chat ${JSON.stringify(chat)} has unsubscribed ${link}`);
        return reply(`已为此聊天退订 ${link} 的媒体推文`);
    }
}
exports.unsub = unsub;
function list(chat, _, reply, lock) {
    if (chat.chatType === "temp" /* Temp */) {
        return reply('请先添加机器人为好友。');
    }
    const links = [];
    Object.keys(lock.threads).forEach(key => {
        if (lock.threads[key].subscribers.find(({ chatID, chatType }) => chat.chatID === chatID && chat.chatType === chatType))
            links.push(`${key} ${datetime_1.relativeDate(lock.threads[key].updatedAt)}`);
    });
    return reply('此聊天中订阅媒体推文的链接：\n' + links.join('\n'));
}
exports.list = list;
function view(chat, args, reply) {
    if (args.length === 0) {
        return reply('找不到要查看的链接。');
    }
    const match = args[0].match(/^(?:.*twitter.com\/[^\/?#]+\/status\/)?(\d+)/);
    if (!match) {
        return reply('链接格式有误。');
    }
    try {
        twitter_1.sendTweet(match[1], chat);
    }
    catch (e) {
        reply('推特机器人尚未加载完毕，请稍后重试。');
    }
}
exports.view = view;
