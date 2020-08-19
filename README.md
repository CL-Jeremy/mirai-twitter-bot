# Mirai Twitter Bot

修改自：[rikakomoe/cqhttp-twitter-bot](https://github.com/rikakomoe/cqhttp-twitter-bot)

使用 API：[YunYouJun/mirai-ts](https://github.com/YunYouJun/mirai-ts)

## 主要区别

- 去除了 Redis
- 图片使用 [sharp](https://github.com/lovell/sharp) 压缩为 JPEG
- 视频使用 [gifski](https://github.com/ImageOptim/gifski) 压缩为 GIF（请务必下载并放到 `PATH` 下，推荐[这里](https://github.com/CL-Jeremy/gifski/releases/tag/1.0.1-unofficial)的最新修改版，注意从包管理器安装依赖）
- 机器人的 QQ 号码必须手动填写

## 配置

它会从命令传入的 JSON 配置文件里读取配置，配置说明如下

| 配置项 | 说明 | 默认 |
| --- | --- | --- |
| mirai_access_token | Mirai HTTP API authKey（需与插件一致，插件若未<br />配置本项会在 console 显示生成值，请将其填入） | （必填） |
| mirai_http_host | Mirai HTTP API 插件服务端地址 | 127.0.0.1 |
| mirai_http_port | Mirai HTTP API 插件服务端口 | 8080 |
| mirai_bot_qq | Mirai HTTP API 登录的目标机器人 QQ 号 | 10000（示例值，必填） |
| twitter_consumer_key | Twitter App consumer_key | （必填） |
| twitter_consumer_secret |  Twitter App consumer_secret | （必填） |
| twitter_access_token_key | Twitter App access_token_key | （必填） |
| twitter_access_token_secret | Twitter App access_token_secret | （必填） |
| mode | 工作模式，0 为图文模式，1 为纯文本模式，2 为文<br />本附图模式 | 0 |
| resume_on_start | 是否在启动时从退出时的进度继续（拉取本应用非活<br />动时期错过的推文） | false |
| work_interval | 对单个订阅两次拉取更新的最少间隔时间（秒） | 60 |
| webshot_delay | 抓取网页截图时等待网页加载的延迟时长（毫秒） | 10000 |
| lockfile | 本地保存订阅信息以便下次启动时恢复 | subscriber.lock |
| loglevel | 日志调试等级 | info |

示例文件在 [`config.example.json`](./config.example.json)

## Bug

- 原项目的列表订阅功能已失效
- 好友消息的图片有可能会失效或直接无法接收（后者会被转换为 `[失败的图片：<地址>]` 格式，然后整条消息会以纯文本模式重发）
- 视频为实验性功能，可能会有各种问题，比如超过大小后会被服务器二压，暂时请酌情自行处理

## Todo

- 重新实现基于 hash 的文件缓存和转推媒体去重
- 添加选项对时间线进行过滤
