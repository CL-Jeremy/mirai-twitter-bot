import axios from 'axios';
import * as CallableInstance from 'callable-instance';
import { XmlEntities } from 'html-entities';

import gifski from './gifski';
import { getLogger } from './loggers';
import { Message, MessageChain } from './mirai';
import { Fleets, FullUser } from './twitter';

const xmlEntities = new XmlEntities();

const ZHType = (type: string) => new class extends String {
  public type = super.toString();
  public toString = () => `[${super.toString()}]`;
}(type);

const typeInZH = {
  photo: ZHType('图片'),
  video: ZHType('视频'),
  animated_gif: ZHType('GIF'),
};

const logger = getLogger('webshot');

class Webshot
extends CallableInstance<
  [FullUser, Fleets, (...args) => Promise<any>, (...args) => void, number],
  Promise<void>
> {

  private mode: number;

  constructor(mode: number, onready?: () => any) {
    super('webshot');
    this.mode = mode;
    onready();
  }

  private fetchMedia = (url: string): Promise<string> => {
    const gif = (data: ArrayBuffer) => {
      const matchDims = url.match(/\/(\d+)x(\d+)\//);
      if (matchDims) {
        const [ width, height ] = matchDims.slice(1).map(Number);
        const factor = width + height > 1600 ? 0.375 : 0.5;
        return gifski(data, width * factor);
      }
      return gifski(data);
    };

    return new Promise<ArrayBuffer>((resolve, reject) => {
      logger.info(`fetching ${url}`);
      axios({
        method: 'get',
        url,
        responseType: 'arraybuffer',
        timeout: 150000,
      }).then(res => {
        if (res.status === 200) {
            logger.info(`successfully fetched ${url}`);
            resolve(res.data);
        } else {
          logger.error(`failed to fetch ${url}: ${res.status}`);
          reject();
        }
      }).catch (err => {
        logger.error(`failed to fetch ${url}: ${err.message}`);
        reject();
      });
    }).then(data =>
      (async ext => {
        switch (ext) {
          case 'jpg':
            return {mimetype: 'image/jpeg', data};
          case 'png':
            return {mimetype: 'image/png', data};
          case 'mp4':
            try {
              return {mimetype: 'image/gif', data: await gif(data)};
            } catch (err) {
              logger.error(err);
              throw Error(err);
            }
        }
      })((url.match(/\?format=([a-z]+)&/) ?? url.match(/.*\/.*\.([^?]+)/))[1])
      .catch(() => {
        logger.warn('unable to find MIME type of fetched media, failing this fetch');
        throw Error();
      })
    ).then(typedData => 
      `data:${typedData.mimetype};base64,${Buffer.from(typedData.data).toString('base64')}`
    );
  }

  public webshot(
    user: FullUser,
    fleets: Fleets,
    uploader: (
      img: ReturnType<typeof Message.Image>,
      lastResort: (...args) => ReturnType<typeof Message.Plain>)
      => Promise<ReturnType<typeof Message.Image | typeof Message.Plain>>,
    callback: (msgs: MessageChain, text: string) => void,
    webshotDelay: number
  ): Promise<void> {
    let promise = new Promise<void>(resolve => {
      resolve();
    });
    fleets.forEach(fleet => {
      promise = promise.then(() => {
        logger.info(`working on ${user.screen_name}/${fleet.fleet_id}`);
      });
      const messageChain: MessageChain = [];

      // text processing
      let author = `${user.name} (@${user.screen_name}):\n`;
      let date = `${new Date(fleet.created_at)}\n`;
      let text = author + date + fleet.media_bounding_boxes?.map(box => box.entity.value).join('\n') ?? '';
      messageChain.push(Message.Plain(author + date));

      // fetch extra entities
      // tslint:disable-next-line: curly
      if (1 - this.mode % 2) promise = promise.then(() => {
          const media = fleet.media_entity;
          let url: string;
          if (fleet.media_key.media_category === 'TWEET_IMAGE') {
            media.type = 'photo';
            url = media.media_url_https.replace(/\.([a-z]+)$/, '?format=$1') + '&name=orig';
          } else {
            media.type = fleet.media_key.media_category === 'TWEET_VIDEO' ? 'video' : 'animated_gif';
            media.video_info = (media as any).media_info.video_info;
            text += `[${typeInZH[media.type].type}]`;
            url = (media.video_info.variants as any) // bitrate -> bit_rate
              .filter(variant => variant.bit_rate !== undefined)
              .sort((var1, var2) => var2.bit_rate - var1.bit_rate)
              .map(variant => variant.url)[0]; // largest video
          }
          const altMessage = Message.Plain(`\n[失败的${typeInZH[media.type].type}：${url}]`);
          return this.fetchMedia(url)
            .then(base64url =>
              uploader(Message.Image('', base64url, media.type === 'photo' ? url : `${url} as gif`), () => altMessage)
            )
            .catch(error => {
              logger.warn('unable to fetch media, sending plain text instead...');
              return altMessage;
            })
            .then(msg => {
              messageChain.push(msg);
            });
      });
      promise.then(() => {
        logger.info(`done working on ${user.screen_name}/${fleet.fleet_id}, message chain:`);
        logger.info(JSON.stringify(messageChain));
        callback(messageChain, xmlEntities.decode(text));
      });
    });
    return promise;
  }
}

export default Webshot;
