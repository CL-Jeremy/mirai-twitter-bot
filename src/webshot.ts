import axios from 'axios';
import * as CallableInstance from 'callable-instance';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { XmlEntities } from 'html-entities';
import { PNG } from 'pngjs';
import * as puppeteer from 'puppeteer';
import { Browser } from 'puppeteer';
import * as sharp from 'sharp';
import { Stream } from 'stream';

import { getLogger } from './loggers';
import { Message, MessageChain } from './mirai';
import { Tweets } from './twitter';

const writeOutTo = (path: string, data: Stream) =>
  new Promise<string>(resolve => {
    data.pipe(createWriteStream(path)).on('close', () => resolve(path));
  });

const xmlEntities = new XmlEntities();

const typeInZH = {
  photo: '[图片]',
  video: '[视频]',
  animated_gif: '[GIF]',
};

const logger = getLogger('webshot');

const mkdirP = dir => { if (!existsSync(dir)) mkdirSync(dir, {recursive: true}); };
const baseName = path => path.split(/[/\\]/).slice(-1)[0];

class Webshot extends CallableInstance<[Tweets, (...args) => void, number], Promise<void>> {

  private browser: Browser;
  private outDir: string;
  private mode: number;

  constructor(outDir: string, mode: number, onready?: () => any) {
    super('webshot');
    mkdirP(this.outDir = outDir);
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
    const jpeg = (data: Stream) => data.pipe(sharp()).jpeg({quality: 90, trellisQuantisation: true});
    const writeOutPic = (pic: Stream) => writeOutTo(`${this.outDir}/${url.replace(/[:\/]/g, '_')}.jpg`, pic);
    const promise = new Promise<{ path: string, boundary: null | number }>((resolve, reject) => {
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

                  writeOutPic(jpeg(this.pack())).then(path => {
                    logger.info(`finished webshot for ${url}`);
                    resolve({path, boundary});
                  });
                } else if (height >= 8 * 1920) {
                  logger.warn('too large, consider as a bug, returning');
                  writeOutPic(jpeg(this.pack())).then(path => {
                    resolve({path, boundary: 0});
                  });
                } else {
                  logger.info('unable to find boundary, try shooting a larger image');
                  resolve({path: '', boundary});
                }
              }).parse(screenshot);
            })
            .then(() => page.close());
        })
        .catch(reject);
    });
    return promise.then(data => {
      if (data.boundary === null) return this.renderWebshot(url, height + 1920, webshotDelay);
      else return data.path;
    }).catch(error =>
      new Promise(resolve => this.reconnect(error, resolve))
      .then(() => this.renderWebshot(url, height, webshotDelay))
    );
  }

  private fetchImage = (url: string, tag: string): Promise<string> =>
    new Promise<Stream>(resolve => {
      logger.info(`fetching ${url}`);
      axios({
        method: 'get',
        url,
        responseType: 'stream',
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
      const imgName = `${tag}${baseName(url.replace(/(\.[a-z]+):(.*)/, '$1__$2$1'))}`;
      return writeOutTo(`${this.outDir}/${imgName}`, data);
    })

  public webshot(
    tweets: Tweets,
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
      const originTwi = twi.retweeted_status || twi;
      const messageChain: MessageChain = [];

      // text processing
      let author = `${twi.user.name} (@${twi.user.screen_name}):\n`;
      if (twi.retweeted_status) author += `RT @${twi.retweeted_status.user.screen_name}: `;

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
          .then(webshotFilePath => {
            if (webshotFilePath) messageChain.push(Message.Image('', '', baseName(webshotFilePath)));
          });
      }
      // fetch extra images
      if (1 - this.mode % 2) {
        if (originTwi.extended_entities) {
          originTwi.extended_entities.media.forEach(media =>
            promise = promise.then(() =>
              this.fetchImage(media.media_url_https + ':orig', `${twi.user.screen_name}-${twi.id_str}--`)
              .then(path => {
                messageChain.push(Message.Image('', '', baseName(path)));
              })
          ));
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
        logger.info(JSON.stringify(messageChain));
        callback(messageChain, xmlEntities.decode(text), author);
      });
    });
    return promise;
  }
}

export default Webshot;
