"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.view = exports.unsub = exports.list = exports.sub = exports.parseCmd = void 0;
const fs = require("fs");
const path = require("path");
const datetime_1 = require("./datetime");
const loggers_1 = require("./loggers");
const twitter_1 = require("./twitter");
const utils_1 = require("./utils");
const logger = loggers_1.getLogger('command');
function parseCmd(message) {
    message = message.trim();
    message = message.replace('\\\\', '\\0x5c');
    message = message.replace('\\\"', '\\0x22');
    message = message.replace('\\\'', '\\0x27');
    const strs = message.match(/'[\s\S]*?'|(?:\S+=)?"[\s\S]*?"|\S+/mg);
    const cmd = (strs === null || strs === void 0 ? void 0 : strs.length) ? strs[0].length ? strs[0].substring(0, 1) === '/' ? strs[0].substring(1) : '' : '' : '';
    const args = (strs !== null && strs !== void 0 ? strs : []).slice(1).map(arg => {
        arg = arg.replace(/^(\S+=)?["']+(?!.*=)|["']+$/g, '$1');
        arg = arg.replace('\\0x27', '\\\'');
        arg = arg.replace('\\0x22', '\\\"');
        arg = arg.replace('\\0x5c', '\\\\');
        return arg;
    });
    return {
        cmd,
        args,
    };
}
exports.parseCmd = parseCmd;
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
        return reply('找不到要订阅的链接。');
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
            offset = utils_1.BigNumOps.plus(matchStatus[1], '-1');
            delete match[1];
        }
    }
    const subscribeTo = (link, config = {}) => {
        const { addNew = false, msg = `已为此聊天订阅 ${link}` } = config;
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
            `已为此聊天订阅 ${link} 并回溯到此动态 ID（含）之后的第一条动态。
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
        return reply('找不到要退订的链接。');
    }
    const match = parseLink(args[0]);
    if (!match) {
        return reply('链接格式有误。');
    }
    const [link, index] = linkFinder(match, chat, lock);
    if (index === -1)
        return list(chat, args, msg => reply('您没有订阅此链接。\n' + msg), lock);
    else {
        lock.threads[link].subscribers.splice(index, 1);
        fs.writeFileSync(path.resolve(lockfile), JSON.stringify(lock));
        logger.warn(`chat ${JSON.stringify(chat)} has unsubscribed ${link}`);
        return reply(`已为此聊天退订 ${link}`);
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
    return reply('此聊天中订阅的链接：\n' + links.join('\n'));
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
function query(chat, args, reply) {
    if (args.length === 0) {
        return reply('找不到要查询的用户。');
    }
    const match = args[0].match(/twitter.com\/([^\/?#]+)/) ||
        args[0].match(/^([^\/?#]+)$/);
    if (!match) {
        return reply('链接格式有误。');
    }
    const conf = { username: match[1], noreps: 'on', norts: 'off' };
    const confZH = {
        count: '数量上限',
        since: '起始点',
        until: '结束点',
        noreps: '忽略回复推文（on/off）',
        norts: '忽略原生转推（on/off）',
    };
    for (const arg of args.slice(1)) {
        const optMatch = arg.match(/^(count|since|until|noreps|norts)=(.*)/);
        if (!optMatch)
            return reply(`未定义的查询参数：${arg}。`);
        const optKey = optMatch[1];
        if (optMatch.length === 1)
            return reply(`查询${confZH[optKey]}参数格式有误。`);
        conf[optKey] = optMatch[2];
        if (optMatch[2] === '')
            return reply(`查询${confZH[optKey]}参数值不可为空。`);
    }
    if (conf.count !== undefined && !Number(conf.count) || Math.abs(Number(conf.count)) > 50) {
        return reply('查询数量上限参数为零、非数值或超出取值范围。');
    }
    try {
        twitter_1.sendTimeline(conf, chat);
    }
    catch (e) {
        logger.error(`error querying timeline, error: ${e}`);
        reply('推特机器人尚未加载完毕，请稍后重试。');
    }
}
exports.query = query;
