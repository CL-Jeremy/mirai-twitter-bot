import axios from 'axios';
import { closeSync, writeSync } from 'fs';
import Mirai, { MessageType } from 'mirai-ts';
import MiraiMessage from 'mirai-ts/dist/message';
import * as temp from 'temp';

import command from './helper';
import { getLogger } from './loggers';

const logger = getLogger('qqbot');

interface IQQProps {
  access_token: string;
  host: string;
  port: number;
  bot_id: number;
  list(chat: IChat, args: string[]): string;
  sub(chat: IChat, args: string[]): string;
  unsub(chat: IChat, args: string[]): string;
}

const ChatTypeMap: Record<MessageType.ChatMessageType, ChatType> = {
  GroupMessage: ChatType.Group,
  FriendMessage: ChatType.Private,
  TempMessage: ChatType.Temp,
};

export type MessageChain = MessageType.MessageChain;
export const Message = MiraiMessage;

export default class {

  private botInfo: IQQProps;
  public bot: Mirai;

  public sendTo = (subscriber: IChat, msg: string | MessageChain) =>
    (() => {
      switch (subscriber.chatType) {
        case 'group':
          return this.bot.api.sendGroupMessage(msg, subscriber.chatID);
        case 'private':
          return this.bot.api.sendFriendMessage(msg, subscriber.chatID);
      }
    })()
    .then(response => {
      logger.info(`pushing data to ${subscriber.chatID} was successful, response:`);
      logger.info(response);
    })
    .catch(reason => {
      logger.error(`error pushing data to ${subscriber.chatID}, reason: ${reason}`);
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

    this.bot.on('message', (msg) => {
      const chat: IChat = {
        chatType: ChatTypeMap[msg.type],
        chatID: 0,
      };
      if (msg.type === 'FriendMessage') {
          chat.chatID = msg.sender.id;
      } else if (msg.type === 'GroupMessage') {
          chat.chatID = msg.sender.group.id;
      }
      const cmdObj = command(msg.plain);
      switch (cmdObj.cmd) {
        case 'twitterpic_sub':
        case 'twitterpic_subscribe':
          msg.reply(this.botInfo.sub(chat, cmdObj.args));
          break;
        case 'twitterpic_unsub':
        case 'twitterpic_unsubscribe':
          msg.reply(this.botInfo.unsub(chat, cmdObj.args));
          break;
        case 'ping':
        case 'twitterpic':
          msg.reply(this.botInfo.list(chat, cmdObj.args));
          break;
        case 'help':
          msg.reply(`推特图片搬运机器人：
/twitterpic - 查询当前聊天中的订阅
/twitterpic_subscribe [链接] - 订阅 Twitter 图片搬运
/twitterpic_unsubscribe [链接] - 退订 Twitter 图片搬运`);
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
    await this.bot.login(this.botInfo.bot_id)
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
