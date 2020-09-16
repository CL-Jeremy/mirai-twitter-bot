"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const twitter_1 = require("./twitter");
const webshot_1 = require("./webshot");
const configPath = './config.json';
let worker;
try {
    const config = require(path.resolve(configPath));
    worker = new twitter_1.default(Object.fromEntries(Object.entries(config).map(([k, v]) => [k.replace('twitter_', ''), v])));
}
catch (e) {
    console.log('Failed to parse config file: ', configPath);
    process.exit(1);
}
const webshot = new webshot_1.default(worker.mode, () => {
    worker.webshot = webshot;
    worker.getTweet('1296935552848035840', (msg, text, author) => {
        console.log(author + text);
        console.log(JSON.stringify(msg));
    }).catch(console.log);
    worker.getTweet('1296935552848035841', (msg, text, author) => {
        console.log(author + text);
        console.log(JSON.stringify(msg));
    }).catch(console.log);
});
worker.queryUser('tomoyokurosawa').then(console.log).catch(console.log);
worker.queryUser('tomoyourosawa').then(console.log).catch(console.log);
worker.queryUser('@tomoyokurosawa').then(console.log).catch(console.log);
