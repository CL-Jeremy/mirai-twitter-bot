# Mirai Twitter Bot

修改自：[rikakomoe/cqhttp-twitter-bot](https://github.com/rikakomoe/cqhttp-twitter-bot)

使用 API：[YunYouJun/mirai-ts](https://github.com/YunYouJun/mirai-ts)

## 主要区别

- 去除了 Redis
- 支持通过列表 ID 订阅列表，和网页端体验一致
- 处理订阅链接时大小写不敏感，新订阅链接时先检查是否存在
- 支持直接查看指定的推文链接，或（在没有其他用户订阅该用户时）从最新推文回溯到该条推文，由新到旧显示
- 图片使用 [sharp](https://github.com/lovell/sharp) 压缩为 JPEG
- 视频使用 [gifski](https://github.com/ImageOptim/gifski) 压缩为 GIF（请务必下载并放到 `PATH` 下，推荐[这里](https://github.com/CL-Jeremy/gifski/releases/tag/1.0.1-unofficial)的最新修改版，注意从包管理器安装依赖）
- 机器人的 QQ 号码必须手动填写
- Puppeteer 不再自动启动，请手动开启并监听本地 9222 端口（这种方式可以使用 Chrome 或是远程 WebSocket 代理服务器）

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

## 系统服务

可以使用 [`systemd`](./systemd) 目录里的服务文件设置成自动启动服务
```
$ cd
$ git clone https://github.com/CL-Jeremy/mirai-twitter-bot
$ cd mirai-twitter-bot
$ npm i
$ wget -S http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_amd64
$ chmod +x miraiOK_linux_amd64
$ wget -qO- https://api.github.com/repos/project-mirai/mirai-api-http/releases/latest | grep "browser" | cut -d'"' -f4 | wget -Sqi- -Pplugins
$ rsync -a systemd ~/.config/
$ systemctl --user daemon-reload
$ systemctl --user enable twitterbot.service
$ loginctl enable-linger
```
注：如果想在本地文件夹保存日志，请取消注释两个服务定义中相应的行，阅读时可以使用 `tail -f`

## Bug

- 好友消息的图片有可能会失效或直接无法接收（后者会被转换为 `[失败的图片：<地址>]` 格式，然后整条消息会以纯文本模式重发）
- 视频为实验性功能，可能会有各种问题，比如超过大小后会被服务器二压，暂时请酌情自行处理

## Todo

- 重新实现基于 hash 的文件缓存和转推媒体去重
- 添加选项对时间线进行过滤
