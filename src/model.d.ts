declare const enum ChatType {
  Private = 'private',
  Group = 'group',
  Temp = 'temp'
}

interface IPrivateChat {
  chatID: number,
  chatType: ChatType.Private,
}

interface IGroupChat {
  chatID: number,
  chatType: ChatType.Group,
}

interface ITempChat {
  chatID: {qq: number, group: number},
  chatType: ChatType.Temp,
}

type IChat = IPrivateChat | IGroupChat | ITempChat;

interface ILock {
  workon: number,
  feed: string[],
  threads: {
    [key: string]:
      {
        offset: string,
        updatedAt: string,
        subscribers: IChat[],
      }
  }
}
