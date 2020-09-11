import axios from 'axios';
import { closeSync, writeSync } from 'fs';
import Mirai, { MessageType } from 'mirai-ts';
import MiraiMessage from 'mirai-ts/dist/message';
import * as temp from 'temp';

import { view } from './command';
import command from './helper';
import { getLogger } from './loggers';

const logger = getLogger('qqbot');

interface IQQProps {
  access_token: string;
  host: string;
  port: number;
  bot_id: number;
  list(chat: IChat, args: string[], replyfn: (msg: string) => any): void;
  sub(chat: IChat, args: string[], replyfn: (msg: string) => any): void;
  unsub(chat: IChat, args: string[], replyfn: (msg: string) => any): void;
}

export type MessageChain = MessageType.MessageChain;
export const Message = MiraiMessage;

export default class {

  private botInfo: IQQProps;
  public bot: Mirai;

  private getChat = (msg: MessageType.ChatMessage): IChat => {
    switch (msg.type) {
      case 'FriendMessage':
        return {
          chatID: msg.sender.id,
          chatType: ChatType.Private,
        };
      case 'GroupMessage':
        return {
          chatID: msg.sender.group.id,
          chatType: ChatType.Group,
        };
      case 'TempMessage':
        this.bot.api.friendList()
        .then((friendList: [{
          id: number,
          nickname: string,
          remark: string,
        }]) => {
          // already befriended
          if (friendList.some(friendItem => friendItem.id = msg.sender.id)) {
            return {
              chatID: msg.sender.id,
              chatType: ChatType.Private,
            };
          }
          return {
            chatID: {
              qq: msg.sender.id,
              group: msg.sender.group.id,
            },
            chatType: ChatType.Temp,
          };
        });
    }
  }

  public sendTo = (subscriber: IChat, msg: string | MessageChain) =>
    (() => {
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
    })

  public uploadPic = (img: MessageType.Image, timeout = -1) => {
    if (timeout) timeout = Math.floor(timeout);
    if (timeout === 0 || timeout < -1) {
      return Promise.reject('Error: timeout must be greater than 0ms');
    }
    let imgFile: string;
    if (img.imageId !== '') return Promise.resolve();
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
        writeSync(tempFile.fd, Buffer.from(img.url.split(',')[1], 'base64'));
        closeSync(tempFile.fd);
        imgFile = tempFile.path;
      } catch (error) {
        logger.error(error);
      }
    }
    try {
      this.bot.axios.defaults.timeout = timeout === -1 ? 0 : timeout;
      logger.info(`uploading ${JSON.stringify(
        Message.Image(img.imageId, `${img.url.split(',')[0]},[...]`, img.path)
      )}...`);
      return this.bot.api.uploadImage('group', imgFile || img.path)
      .then(response => { // workaround for https://github.com/mamoe/mirai/issues/194
        logger.info(`uploading ${img.path} as group image was successful, response:`);
        logger.info(JSON.stringify(response));
        img.url = '';
        img.path = (response.path as string).split(/[/\\]/).slice(-1)[0];
      })
      .catch(reason => {
        logger.error(`error uploading ${img.path}, reason: ${reason}`);
        throw Error(reason);
      });
    } finally {
      temp.cleanup();
      this.bot.axios.defaults.timeout = 0;
    }
  }

  private initBot = () => {
    this.bot = new Mirai({
      authKey: this.botInfo.access_token,
      enableWebsocket: false,
      host: this.botInfo.host,
      port: this.botInfo.port,
    });

    this.bot.axios.defaults.maxContentLength = Infinity;

    this.bot.on('NewFriendRequestEvent', evt => {
      logger.debug(`detected new friend request event: ${JSON.stringify(evt)}`);
      this.bot.api.groupList()
      .then((groupList: [{
        id: number,
        name: string,
        permission: 'OWNER' | 'ADMINISTRATOR' | 'MEMBER',
      }]) => {
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
      .then((friendList: [{
        id: number,
        nickname: string,
        remark: string,
      }]) => {
        if (friendList.some(friendItem => friendItem.id = evt.fromId)) {
          evt.respond('allow');
          return logger.info(`accepted group invitation from ${evt.fromId} (friend)`);
        }
        logger.warn(`received group invitation from ${evt.fromId} (unknown)`);
        logger.warn('please manually accept this group invitation');
      });
    });

    this.bot.on('message', msg => {
      const chat = this.getChat(msg);
      const cmdObj = command(msg.plain);
      switch (cmdObj.cmd) {
        case 'twitter_view':
        case 'twitter_get':
          view(chat, cmdObj.args, msg.reply);
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
          msg.reply(`推特搬运机器人：
/twitter - 查询当前聊天中的订阅
/twitter_subscribe [链接] - 订阅 Twitter 搬运
/twitter_unsubscribe [链接] - 退订 Twitter 搬运
/twitter_view [链接] - 查看推文
${chat.chatType === ChatType.Temp &&
  '（当前游客模式下无法使用订阅功能，请先添加本账号为好友。）'
}`);
      }
    });
}

  // TODO doesn't work if connection is dropped after connection
  private listen = (logMsg?: string) => {
    if (logMsg !== '') {
      logger.warn(logMsg ?? 'Listening...');
    }
    axios.get(`http://${this.botInfo.host}:${this.botInfo.port}/about`)
    .then(async () => {
      if (logMsg !== '') {
        this.bot.listen();
        await this.login();
      }
      setTimeout(() => this.listen(''), 5000);
    })
    .catch(() => {
      logger.error(`Error connecting to bot provider at ${this.botInfo.host}:${this.botInfo.port}`);
      setTimeout(() => this.listen('Retry listening...'), 2500);
    });
  }

  private login = async (logMsg?: string) => {
    logger.warn(logMsg ?? 'Logging in...');
    await this.bot.link(this.botInfo.bot_id)
    .then(() => logger.warn(`Logged in as ${this.botInfo.bot_id}`))
    .catch(() => {
      logger.error(`Cannot log in. Do you have a bot logged in as ${this.botInfo.bot_id}?`);
      setTimeout(() => this.login('Retry logging in...'), 2500);
    });
  }

  public connect = () => {
    this.initBot();
    this.listen();
  }

  constructor(opt: IQQProps) {
    logger.warn(`Initialized mirai-ts for ${opt.host}:${opt.port} with access_token ${opt.access_token}`);
    this.botInfo = opt;
  }
}
