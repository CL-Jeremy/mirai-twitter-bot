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
        /**
         * Offset for next timeline query.
         *
         * @description definition changes:
         * - -1: initial value for existing feeds after program start
         * - 0: initial value for new feeds right after subscription
         * - positive offset: starting/minimum tweet ID (exclusive) for next query
         * - negative offset: (inverse of) ending/maximum tweet ID (inclusive) for next query
         *
         * The type is now string to avoid losing accuracy for big integers.
         */
        offset: string,
        updatedAt: string,
        subscribers: IChat[],
      }
  }
}
