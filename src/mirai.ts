import axios from 'axios';
import Mirai, { MessageType } from 'mirai-ts';

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

export default class {

  private botInfo: IQQProps;
  public bot: Mirai;

  public sendTo = (subscriber: IChat, msg) => {
    switch (subscriber.chatType) {
      case 'group':
        return this.bot.api.sendGroupMessage(msg, subscriber.chatID)
        .catch(reason => 
          logger.error(`error pushing data to ${subscriber.chatID}, reason: ${reason}`));
      case 'private':
        return this.bot.api.sendFriendMessage(msg, subscriber.chatID)
        .catch(reason => 
          logger.error(`error pushing data to ${subscriber.chatID}, reason: ${reason}`));
    }
  }

  private initBot = () => {
    this.bot = new Mirai({
      authKey: this.botInfo.access_token,
      enableWebsocket: false,
      host: this.botInfo.host,
      port: this.botInfo.port,
    });

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
}

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
