import * as fs from 'fs';
import * as path from 'path';

import { relativeDate } from './datetime';
import { getLogger } from './loggers';
import { sendTweet, ScreenNameNormalizer as normalizer } from './twitter';

const logger = getLogger('command');

function parseLink(link: string): string[] {
  let match =
    link.match(/twitter.com\/([^\/?#]+)\/lists\/([^\/?#]+)/) ||
    link.match(/^([^\/?#]+)\/([^\/?#]+)$/);
  if (match) return [match[1], `/lists/${match[2]}`];
  match =
    link.match(/twitter.com\/([^\/?#]+)\/status\/(\d+)/);
  if (match) return [match[1], `/status/${match[2]}`];
  match =
    link.match(/twitter.com\/([^\/?#]+)/) ||
    link.match(/^([^\/?#]+)$/);
  if (match) return [match[1]];
  return;
}

function linkBuilder(userName: string, more = ''): string {
  if (!userName) return;
  return `https://twitter.com/${userName}${more}`;
}

function linkFinder(checkedMatch: string[], chat: IChat, lock: ILock): [string, number] {
  const normalizedLink =
    linkBuilder(normalizer.normalize(checkedMatch[0]), checkedMatch[1]?.toLowerCase());
  const link = Object.keys(lock.threads).find(realLink => 
    normalizedLink === realLink.replace(/\/@/, '/').toLowerCase()
  );
  if (!link) return [null, -1];
  const index = lock.threads[link].subscribers.findIndex(({chatID, chatType}) => 
    chat.chatID === chatID && chat.chatType === chatType
  );
  return [link, index];
}

function sub(chat: IChat, args: string[], reply: (msg: string) => any,
  lock: ILock, lockfile: string
): void {
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
      offset = String(matchStatus[1] as unknown as number - 1);
      delete match[1];
    }
  }
  const subscribeTo = (link: string, config: {addNew?: boolean, msg?: string} = {}) => {
    const {addNew = false, msg = `已为此聊天订阅 ${link} 的媒体推文`} = config;
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
  if (index > -1) return reply('此聊天已订阅此链接。');
  if (realLink) return subscribeTo(realLink);
  const [rawUserName, more] = match;
  if (rawUserName.toLowerCase() === 'i' && more.match(/lists\/(\d+)/)) {
    return subscribeTo(linkBuilder('i', more), {addNew: true});
  }
  normalizer.normalizeLive(rawUserName).then(userName => {
    if (!userName) return reply(`找不到用户 @${rawUserName}。`);
    const link = linkBuilder(userName, more);
    const msg = (offset === '0') ?
      undefined :
        `已为此聊天订阅 ${link} 的媒体动态并回溯到此动态 ID（含）之后的第一条媒体动态。
（参见：https://blog.twitter.com/engineering/en_us/a/2010/announcing-snowflake.html）`;
    subscribeTo(link, {addNew: true, msg});
  });
}

function unsub(chat: IChat, args: string[], reply: (msg: string) => any,
  lock: ILock, lockfile: string
): void {
  if (args.length === 0) {
    return reply('找不到要退订媒体推文的链接。');
  }
  const match = parseLink(args[0]);
  if (!match) {
    return reply('链接格式有误。');
  }
  const [link, index] = linkFinder(match, chat, lock);
  if (index === -1) return list(chat, args, msg => reply('您没有订阅此链接的媒体推文。\n' + msg), lock);
  else {
    lock.threads[link].subscribers.splice(index, 1);
    fs.writeFileSync(path.resolve(lockfile), JSON.stringify(lock));
    logger.warn(`chat ${JSON.stringify(chat)} has unsubscribed ${link}`);
    return reply(`已为此聊天退订 ${link} 的媒体推文`);
  }
}

function list(chat: IChat, _: string[], reply: (msg: string) => any, lock: ILock): void {
  const links = [];
  Object.keys(lock.threads).forEach(key => {
    if (lock.threads[key].subscribers.find(({chatID, chatType}) => 
      chat.chatID === chatID && chat.chatType === chatType
    )) links.push(`${key} ${relativeDate(lock.threads[key].updatedAt)}`);
  });
  return reply('此聊天中订阅媒体推文的链接：\n' + links.join('\n'));
}

function view(chat: IChat, args: string[], reply: (msg: string) => any): void {
  if (args.length === 0) {
    return reply('找不到要查看的链接。');
  }
  const match = args[0].match(/^(?:.*twitter.com\/[^\/?#]+\/status\/)?(\d+)/);
  if (!match) {
    return reply('链接格式有误。');
  }
  try {
    sendTweet(match[1], chat);
  } catch (e) {
    reply('推特机器人尚未加载完毕，请稍后重试。');
  }
}

export { sub, list, unsub, view };
