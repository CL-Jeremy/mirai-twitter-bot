import axios from 'axios';
import * as CallableInstance from 'callable-instance';
import { XmlEntities } from 'html-entities';
import { PNG } from 'pngjs';
import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import * as sharp from 'sharp';
import { Readable } from 'stream';

import { getLogger } from './loggers';
import { Message, MessageChain } from './mirai';
import { Tweets } from './twitter';

const xmlEntities = new XmlEntities();

const typeInZH = {
  photo: '[图片]',
  video: '[视频]',
  animated_gif: '[GIF]',
};

const logger = getLogger('webshot');

class Webshot
extends CallableInstance<
  [Tweets, (...args) => Promise<any>, (...args) => void, number],
  Promise<void>
> {

  private browser: Browser;
  private mode: number;

  constructor(mode: number, onready?: () => any) {
    super('webshot');
    // tslint:disable-next-line: no-conditional-assignment
    if (this.mode = mode) {
      onready();
    } else {
      this.connect(onready);
    }
  }

  // use local Chromium
  private connect = (onready) => puppeteer.connect({browserURL: 'http://127.0.0.1:9222'})
  .then(browser => this.browser = browser)
  .then(() => {
    logger.info('launched puppeteer browser');
    if (onready) return onready();
  })
  .catch(error => this.reconnect(error, onready))

  private reconnect = (error, onready?) => {
    logger.error(`connection error, reason: ${error}`);
    logger.warn('trying to reconnect in 2.5s...');
    return new Promise(resolve => setTimeout(resolve, 2500))
    .then(() => this.connect(onready));
  }

  private renderWebshot = (url: string, height: number, webshotDelay: number): Promise<string> => {
    const jpeg = (data: Readable) => data.pipe(sharp()).jpeg({quality: 90, trellisQuantisation: true});
    const sharpToBase64 = (pic: sharp.Sharp) => new Promise<string>(resolve => {
      pic.toBuffer().then(buffer => resolve(`data:image/jpg;base64,${buffer.toString('base64')}`));
    });
    const promise = new Promise<{ base64: string, boundary: null | number }>((resolve, reject) => {
      const width = 720;
      const zoomFactor = 2;
      logger.info(`shooting ${width}*${height} webshot for ${url}`);
      this.browser.newPage()
        .then(page => {
          page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36')
            .then(() => page.setViewport({
              width: width / zoomFactor,
              height: height / zoomFactor,
              isMobile: true,
              deviceScaleFactor: zoomFactor,
            }))
            .then(() => page.setBypassCSP(true))
            .then(() => page.goto(url, {waitUntil: 'load', timeout: 150000}))
            // hide header, "more options" button, like and retweet count
            .then(() => page.addStyleTag({
              content: 'header{display:none!important}path[d=\'M20.207 7.043a1 1 0 0 0-1.414 0L12 13.836 5.207 7.043a1 1 0 0 0-1.414 1.414l7.5 7.5a.996.996 0 0 0 1.414 0l7.5-7.5a1 1 0 0 0 0-1.414z\'],div[role=\'button\']{display: none;}',
            }))
            .then(() => page.waitFor(webshotDelay))
            .then(() => page.addScriptTag({
              content: 'document.documentElement.scrollTop=0;',
            }))
            .then(() => page.screenshot())
            .then(screenshot => {
              new PNG({
                filterType: 4,
                deflateLevel: 0,
              }).on('parsed', function () {
                // remove comment area
                // tslint:disable-next-line: no-shadowed-variable
                const idx = (x: number, y: number) => (this.width * y + x) << 2;
                let boundary = null;
                let x = zoomFactor * 2;
                for (let y = 0; y < this.height; y++) {
                  if (this.data[idx(x, y)] !== 255) {
                    if (this.data[idx(x, y + 18 * zoomFactor)] !== 255) {
                      // footer kicks in
                      boundary = null;
                    } else {
                      boundary = y;
                    }
                    break;
                  }
                }
                if (boundary !== null) {
                  logger.info(`found boundary at ${boundary}, cropping image`);
                  this.data = this.data.slice(0, idx(this.width, boundary));
                  this.height = boundary;

                  boundary = null;
                  x = Math.floor(16 * zoomFactor);
                  let flag = false;
                  let cnt = 0;
                  for (let y = this.height - 1; y >= 0; y--) {
                    if ((this.data[idx(x, y)] === 255) === flag) {
                      cnt++;
                      flag = !flag;
                    } else continue;

                    // line above the "comment", "retweet", "like", "share" button row
                    if (cnt === 2) {
                      boundary = y + 1;
                    }

                    // if there are a "retweet" count and "like" count row, this will be the line above it
                    if (cnt === 4) {
                      const b = y + 1;
                      if (this.height - boundary - (boundary - b) <= 1) {
                        boundary = b;
                    //   }
                    // }

                    // // if "retweet" count and "like" count are two rows, this will be the line above the first
                    // if (cnt === 6) {
                    //   const c = y + 1;
                    //   if (this.height - boundary - 2 * (boundary - c) <= 2) {
                    //     boundary = c;
                        break;
                      }
                    }
                  }
                  if (boundary != null) {
                    logger.info(`found boundary at ${boundary}, trimming image`);
                    this.data = this.data.slice(0, idx(this.width, boundary));
                    this.height = boundary;
                  }

                  sharpToBase64(jpeg(this.pack())).then(base64 => {
                    logger.info(`finished webshot for ${url}`);
                    resolve({base64, boundary});
                  });
                } else if (height >= 8 * 1920) {
                  logger.warn('too large, consider as a bug, returning');
                  sharpToBase64(jpeg(this.pack())).then(base64 => {
                    resolve({base64, boundary: 0});
                  });
                } else {
                  logger.info('unable to find boundary, try shooting a larger image');
                  resolve({base64: '', boundary});
                }
              }).parse(screenshot);
            })
            .then(() => page.close());
        })
        .catch(reject);
    });
    return promise.then(data => {
      if (data.boundary === null) return this.renderWebshot(url, height + 1920, webshotDelay);
      else return data.base64;
    }).catch(error =>
      new Promise(resolve => this.reconnect(error, resolve))
      .then(() => this.renderWebshot(url, height, webshotDelay))
    );
  }

  private fetchImage = (url: string): Promise<string> =>
    new Promise<ArrayBuffer>(resolve => {
      logger.info(`fetching ${url}`);
      axios({
        method: 'get',
        url,
        responseType: 'arraybuffer',
      }).then(res => {
        if (res.status === 200) {
            logger.info(`successfully fetched ${url}`);
            resolve(res.data);
        } else {
          logger.error(`failed to fetch ${url}: ${res.status}`);
          resolve();
        }
      }).catch (err => {
        logger.error(`failed to fetch ${url}: ${err.message}`);
        resolve();
      });
    }).then(data => {
      const mimetype = (ext => {
        switch (ext) {
          case 'jpg':
            return 'image/jpeg';
          case 'png':
            return 'image/png';
          case 'gif':
            return 'image/gif';
        }
      })(url.match(/(\.[a-z]+):(.*)/)[1]);
      return `data:${mimetype};base64,${Buffer.from(data).toString('base64')}`;
    })

  public webshot(
    tweets: Tweets,
    uploader: (
      img: ReturnType<typeof Message.Image>,
      lastResort: (...args) => ReturnType<typeof Message.Plain>)
      => Promise<ReturnType<typeof Message.Image | typeof Message.Plain>>,
    callback: (msgs: MessageChain, text: string, author: string) => void,
    webshotDelay: number
  ): Promise<void> {
    let promise = new Promise<void>(resolve => {
      resolve();
    });
    tweets.forEach(twi => {
      promise = promise.then(() => {
        logger.info(`working on ${twi.user.screen_name}/${twi.id_str}`);
      });
      const originTwi = twi;
      const messageChain: MessageChain = [];

      // text processing
      const author = `${twi.user.name} (@${twi.user.screen_name}):\n`;

      let text = originTwi.full_text;

      promise = promise.then(() => {
        if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
          originTwi.entities.urls.forEach(url => {
            text = text.replace(new RegExp(url.url, 'gm'), url.expanded_url);
          });
        }
        if (originTwi.extended_entities) {
          originTwi.extended_entities.media.forEach(media => {
            text = text.replace(new RegExp(media.url, 'gm'), this.mode === 1 ? typeInZH[media.type] : '');
          });
        }
        if (this.mode > 0) messageChain.push(Message.Plain(author + xmlEntities.decode(text)));
      });

      // invoke webshot
      if (this.mode === 0) {
        const url = `https://mobile.twitter.com/${twi.user.screen_name}/status/${twi.id_str}`;
        promise = promise.then(() => this.renderWebshot(url, 1920, webshotDelay))
          .then(base64url => {
            if (base64url) {
              return uploader(Message.Image('', base64url, url), () => Message.Plain(author + text));
            }
          })
          .then(msg => {
            if (msg) messageChain.push(msg);
          });
      }
      // fetch extra images
      if (1 - this.mode % 2) {
        if (originTwi.extended_entities) {
          originTwi.extended_entities.media.forEach(media => {
            const url = media.media_url_https + ':orig';
            promise = promise.then(() => this.fetchImage(url))
              .then(base64url =>
                uploader(Message.Image('', base64url, url), () => Message.Plain(`[失败的图片：${url}]`))
              )
              .then(msg => {
                messageChain.push(msg);
              });
          });
        }
      }
      // append URLs, if any
      if (this.mode === 0) {
        if (originTwi.entities && originTwi.entities.urls && originTwi.entities.urls.length) {
          promise = promise.then(() => {
            const urls = originTwi.entities.urls
              .filter(urlObj => urlObj.indices[0] < originTwi.display_text_range[1])
              .map(urlObj => urlObj.expanded_url);
            if (urls.length) {
              messageChain.push(Message.Plain(urls.join('\n')));
            }
          });
        }
      }
      promise.then(() => {
        logger.info(`done working on ${twi.user.screen_name}/${twi.id_str}, message chain:`);
        logger.info(JSON.stringify(messageChain.map(message => {
          if (message.type === 'Image' && message.url.startsWith('data:')) {
            return Message.Image(message.imageId, 'data:[...]', message.path);
          }
          return message;
        })));
        callback(messageChain, xmlEntities.decode(text), author);
      });
    });
    return promise;
  }
}

export default Webshot;
