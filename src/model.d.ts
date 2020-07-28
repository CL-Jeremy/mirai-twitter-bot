declare const enum ChatType {
  Private = 'private',
  Group = 'group',
  Discuss = 'discuss',
  Temp = 'temp'
}

interface IChat {
  chatID: number,
  chatType: ChatType,
}

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
