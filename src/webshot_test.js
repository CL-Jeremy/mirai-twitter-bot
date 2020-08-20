import * as temp from 'temp';
import { closeSync, writeSync } from 'fs';

import { Message } from './mirai';
import Webshot from './webshot';

const twitter = [
  {created_at: 'Sun Jul 01 07:59:04 +0000 2018', id: 1013331138780073986, id_str: '1013331138780073986', full_text: '\u5927\u962a\u30fc\u30fc\u30fc\uff01\uff01\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3057\u305f\uff01\n\u672c\u65e5\u306e\u30b9\u30c6\u30c3\u30ab\u30fc\u306f\u30a8\u30e0\uff01\n\u4eca\u65e5\u306e\u30e9\u30a4\u30d6\u306f\u4e8b\u6545\u3089\u305a\u3061\u3083\u3093\u3068\u6b4c\u3048\u307e\u3057\u305f\u3088\u304b\u3063\u305f\u2026\n\u6e29\u304b\u3044\u96f0\u56f2\u6c17\u306b\u5305\u307e\u308c\u3066\u3044\u3066\u3068\u3066\u3082\u697d\u3057\u304b\u3063\u305f\u3067\u3059\ud83d\udc30\ud83c\udf38\n\u3067\u306f\u307e\u305f\u301c\n#ggo_anime https:\/\/t.co\/ki6F1UIzd1', truncated: false, display_text_range: [0, 140], entities: {hashtags: [{text: 'ggo_anime', indices: [91, 101]}], symbols: [], user_mentions: [], urls: [{url: 'https:\/\/t.co\/ki6F1UIzd1', expanded_url: 'https:\/\/twitter.com\/ggo_anime\/status\/1013320112382738432', display_url: 'twitter.com\/ggo_anime\/stat\u2026', indices: [102, 125]}]}, source: '\u003ca href="http:\/\/twitter.com\/download\/iphone" rel="nofollow"\u003eTwitter for iPhone\u003c\/a\u003e', in_reply_to_status_id: null, in_reply_to_status_id_str: null, in_reply_to_user_id: null, in_reply_to_user_id_str: null, in_reply_to_screen_name: null, user: {id: 847365153691582465, id_str: '847365153691582465', name: '\u6960\u6728\u3068\u3082\u308a', screen_name: 'tomori_kusunoki', location: '\u30bd\u30cb\u30fc\u30fb\u30df\u30e5\u30fc\u30b8\u30c3\u30af \u30a2\u30fc\u30c6\u30a3\u30b9\u30c4', description: '\u58f0\u306e\u304a\u4ed5\u4e8b\ud83c\udf33\ud83c\udf1f\u300e\u307f\u3093\u306a\u306e\u5fc3\u306b\u3042\u304b\u308a\u3092\u706f\u3057\u305f\u3044\u300f#\u304d\u3089\u3089\u30d5\u30a1\u30f3\u30bf\u30b8\u30a2 \u304d\u3089\u3089\uff0f#\u30e1\u30eb\u30d8\u30f3\u30e1\u30c9\u30d8\u30f3 \u9375\u6751\u8449\u6708\uff0f\u30e9\u30d6\u30e9\u30a4\u30d6\uff01 #\u8679\u30f6\u54b2\u5b66\u5712\u30b9\u30af\u30fc\u30eb\u30a2\u30a4\u30c9\u30eb\u540c\u597d\u4f1a \u512a\u6728\u305b\u3064\u83dc\uff0f#GGO \u30ec\u30f3(ED\u4e3b\u984c\u6b4c)\u30fb\u5c0f\u6bd4\u985e\u5dfb\u9999\u84ee\u30fb\u30d4\u30fc\u3061\u3083\u3093\u30fbSE\uff0f#\u30d7\u30ea\u30c1\u30e3\u30f3 \u6843\u5c71\u3072\u304b\u308a\uff0f#\u30ea\u30dc\u30eb\u30f4 \u767d\u96ea\u30e1\u30a4\uff0f#\u6e29\u6cc9\u3080\u3059\u3081 \u5927\u624b\u753a\u68a8\u7a1f etc\u2026', url: 'https:\/\/t.co\/7Or7jrjDea', entities: {url: {urls: [{url: 'https:\/\/t.co\/7Or7jrjDea', expanded_url: 'http:\/\/sm.sma.co.jp\/artist\/profile\/index\/441', display_url: 'sm.sma.co.jp\/artist\/profile\u2026', indices: [0, 23]}]}, description: {urls: []}}, protected: false, followers_count: 52408, friends_count: 120, listed_count: 1108, created_at: 'Thu Mar 30 08:29:30 +0000 2017', favourites_count: 1094, utc_offset: null, time_zone: null, geo_enabled: false, verified: false, statuses_count: 2369, lang: 'ja', contributors_enabled: false, is_translator: false, is_translation_enabled: false, profile_background_color: 'F5F8FA', profile_background_image_url: null, profile_background_image_url_https: null, profile_background_tile: false, profile_image_url: 'http:\/\/pbs.twimg.com\/profile_images\/980120025364234240\/71mr4MlA_normal.jpg', profile_image_url_https: 'https:\/\/pbs.twimg.com\/profile_images\/980120025364234240\/71mr4MlA_normal.jpg', profile_banner_url: 'https:\/\/pbs.twimg.com\/profile_banners\/847365153691582465\/1516035295', profile_link_color: '1DA1F2', profile_sidebar_border_color: 'C0DEED', profile_sidebar_fill_color: 'DDEEF6', profile_text_color: '333333', profile_use_background_image: true, has_extended_profile: true, default_profile: true, default_profile_image: false, following: true, follow_request_sent: false, notifications: false, translator_type: 'none'}, geo: null, coordinates: null, place: null, contributors: null, is_quote_status: true, quoted_status_id: 1013320112382738432, quoted_status_id_str: '1013320112382738432', quoted_status: {created_at: 'Sun Jul 01 07:15:16 +0000 2018', id: 1013320112382738432, id_str: '1013320112382738432', full_text: 'Blu-ray&amp;DVD\u767a\u58f2\u8a18\u5ff5\u30a4\u30d9\u30f3\u30c8in\u30a2\u30cb\u30e1\u30a4\u30c8\u5927\u962a\u65e5\u672c\u6a4b\u306b\u3054\u6765\u5834\u9802\u3044\u305f\u7686\u3055\u307e\u3001\u3042\u308a\u304c\u3068\u3046\u3054\u3056\u3044\u307e\u3057\u305f\uff01\uff01\n\u30a8\u30e0\u306e\u30b9\u30c6\u30c3\u30ab\u30fc\u3001\u305c\u3072\u4f7f\u3063\u3066\u4e0b\u3055\u3044\u306d\uff01\n\n\u6b21\u56de\u306f7\/14(\u571f)\u306b\u30a2\u30cb\u30e1\u30a4\u30c8\u672d\u5e4c\u3067\u958b\u50ac\uff01\u3054\u53c2\u52a0\u304a\u5f85\u3061\u3057\u3066\u3044\u307e\u3059\uff01\u2026 https:\/\/t.co\/hBAeISZTHP', truncated: true, entities: {hashtags: [], symbols: [], user_mentions: [], urls: [{url: 'https:\/\/t.co\/hBAeISZTHP', expanded_url: 'https:\/\/twitter.com\/i\/web\/status\/1013320112382738432', display_url: 'twitter.com\/i\/web\/status\/1\u2026', indices: [117, 140]}]}, source: '\u003ca href="http:\/\/twitter.com\/download\/iphone" rel="nofollow"\u003eTwitter for iPhone\u003c\/a\u003e', in_reply_to_status_id: null, in_reply_to_status_id_str: null, in_reply_to_user_id: null, in_reply_to_user_id_str: null, in_reply_to_screen_name: null, user: {id: 910009201987948544, id_str: '910009201987948544', name: 'TV\u30a2\u30cb\u30e1\u300cSAO \u30aa\u30eb\u30bf\u30ca\u30c6\u30a3\u30d6 \u30ac\u30f3\u30b2\u30a4\u30eb\u30fb\u30aa\u30f3\u30e9\u30a4\u30f3\u300d\u516c\u5f0f', screen_name: 'ggo_anime', location: '', description: '\u6642\u96e8\u6ca2\u6075\u4e00&\u9ed2\u661f\u7d05\u767d\u306b\u3088\u308b\u3001\u3082\u3046\u3072\u3068\u3064\u306e\u300e\u30bd\u30fc\u30c9\u30a2\u30fc\u30c8\u30fb\u30aa\u30f3\u30e9\u30a4\u30f3\u300f\u304cTV\u30a2\u30cb\u30e1\u5316\u6c7a\u5b9a\uff014\u6708\u3088\u308a\u653e\u9001\u4e2d\uff01\uff01  #ggo_anime', url: 'https:\/\/t.co\/L3pWqog3sG', entities: {url: {urls: [{url: 'https:\/\/t.co\/L3pWqog3sG', expanded_url: 'http:\/\/gungale-online.net', display_url: 'gungale-online.net', indices: [0, 23]}]}, description: {urls: []}}, protected: false, followers_count: 112161, friends_count: 11, listed_count: 783, created_at: 'Tue Sep 19 05:14:35 +0000 2017', favourites_count: 0, utc_offset: null, time_zone: null, geo_enabled: false, verified: false, statuses_count: 1360, lang: 'ja', contributors_enabled: false, is_translator: false, is_translation_enabled: false, profile_background_color: 'F5F8FA', profile_background_image_url: null, profile_background_image_url_https: null, profile_background_tile: false, profile_image_url: 'http:\/\/pbs.twimg.com\/profile_images\/958944604878921728\/TDx5kxQW_normal.jpg', profile_image_url_https: 'https:\/\/pbs.twimg.com\/profile_images\/958944604878921728\/TDx5kxQW_normal.jpg', profile_banner_url: 'https:\/\/pbs.twimg.com\/profile_banners\/910009201987948544\/1521102524', profile_link_color: '1DA1F2', profile_sidebar_border_color: 'C0DEED', profile_sidebar_fill_color: 'DDEEF6', profile_text_color: '333333', profile_use_background_image: true, has_extended_profile: false, default_profile: true, default_profile_image: false, following: true, follow_request_sent: false, notifications: false, translator_type: 'none'}, geo: null, coordinates: null, place: null, contributors: null, is_quote_status: false, retweet_count: 222, favorite_count: 883, favorited: false, retweeted: false, possibly_sensitive: false, lang: 'ja'}, retweet_count: 235, favorite_count: 1165, favorited: false, retweeted: false, possibly_sensitive: false, lang: 'ja'},
  {id: 1296023627830190000, id_str: '1296023627830190081', full_text: 'gone', user: {id: 906724760633073700, id_str: '906724760633073664', name: '\u4f1a\u6ca2 \u7d17\u5f25', screen_name: '_saya_aizawa', location: '\u697d\u5712', description: '\u30b9\u30bf\u30fc\u30c0\u30b9\u30c8\u30d7\u30ed\u30e2\u30fc\u30b7\u30e7\u30f3\u306e\u65b0\u4eba\u58f0\u512a\u3067\u3059\ud83d\udc1f\ud83d\udca8 #\u30b9\u30c8\u30d6\u30e9 \u9999\u83c5\u8c37\u96eb\u68a8\u30fb\u30ab\u30b9\u30c6\u30a3\u30a8\u30e9/ #\u30c7\u30ec\u30de\u30b9 \u95a2\u88d5\u7f8e/ #ZX_SHiFT \u30da\u30af\u30c6\u30a3\u30ea\u30b9/ #\u6e29\u6cc9\u3080\u3059\u3081 \u9ce5\u7fbd\u4e9c\u77e2\u6d77/ \u914d\u4fe1 #\u4f1a\u6ca2\u708e\u4e0a #\u5973\u5b50\u9ad8\u751f\u6700\u9ad8 \u7b49\u2026\u4f55\u5352\u5b9c\u3057\u304f\u304a\u9858\u3044\u81f4\u3057\u307e\u3059\uff01\uff01DM\u4e8b\u52d9\u6240\u7ba1\u7406', url: null, entities: {description: {urls: []}}, protected: false, followers_count: 56307, friends_count: 319, listed_count: 2129, created_at: 'Sun Sep 10 03:43:23 +0000 2017', favourites_count: 2265, utc_offset: null, time_zone: null, geo_enabled: true, verified: false, statuses_count: 3430, lang: null, contributors_enabled: false, is_translator: false, is_translation_enabled: false, profile_background_color: 'F5F8FA', profile_background_image_url: null, profile_background_image_url_https: null, profile_background_tile: false, profile_image_url: 'http://pbs.twimg.com/profile_images/1245362043697295360/IVXlMhY-_normal.jpg', profile_image_url_https: 'https://pbs.twimg.com/profile_images/1245362043697295360/IVXlMhY-_normal.jpg', profile_banner_url: 'https://pbs.twimg.com/profile_banners/906724760633073664/1579104359', profile_link_color: '1DA1F2', profile_sidebar_border_color: 'C0DEED', profile_sidebar_fill_color: 'DDEEF6', profile_text_color: '333333', profile_use_background_image: true, has_extended_profile: true, default_profile: true, default_profile_image: false, following: false, follow_request_sent: false, notifications: false, translator_type: 'none'}},
  {created_at: "Tue Aug 18 05:13:24 +0000 2020", id: 1295589593513750528, id_str: "1295589593513750528", full_text: "\u300c\u30a2\u30a4\u30c9\u30eb\u30de\u30b9\u30bf\u30fc \u30b7\u30f3\u30c7\u30ec\u30e9\u30ac\u30fc\u30eb\u30ba\u5287\u5834\u300d\n4\u30b7\u30fc\u30ba\u30f3\u3092\u7db2\u7f85\u3057\u305fBlu-ray BOX\u30018/26\u767a\u58f2\uff01\n\n\u25c6TV\u7248 \u516852\u8a71\u3001\u7279\u5225\u7248 \u516840\u8a71\u3001\u30ce\u30f3\u30c6\u30ed\u30c3\u30d7ED\u3084PV\u306a\u3069\u3001\u3092\u53ce\u9332\uff01\n\n\u25c6BD2\u679a\u30fbCD1\u679a\u30fbCD-ROM1\u679a\u30fb\u8c6a\u83ef\u30d6\u30c3\u30af\u30ec\u30c3\u30c8\u3092\u53ce\u7d0d\uff01\n\n#\u3057\u3093\u3052\u304d\n#\u8ab0\u304c\u51fa\u308b\u304b\u306a\n https://t.co/77DFLtcPCu https://t.co/ulSeFrtYTa", truncated: false, display_text_range: [0,165], entities: {hashtags: [{text: "\u3057\u3093\u3052\u304d", indices: [127,132]},{text: "\u8ab0\u304c\u51fa\u308b\u304b\u306a", indices: [133,140]}], symbols: [], user_mentions: [], urls: [{url: "https://t.co/77DFLtcPCu", expanded_url: "http://cingeki-anime.com/product/", display_url: "cingeki-anime.com/product/", indices: [142,165]}], media: [{id: 1295588525241294800, id_str: "1295588525241294848", indices: [166,189], media_url: "http://pbs.twimg.com/tweet_video_thumb/Efra5j4UYAAJUbk.jpg", media_url_https: "https://pbs.twimg.com/tweet_video_thumb/Efra5j4UYAAJUbk.jpg", url: "https://t.co/ulSeFrtYTa", display_url: "pic.twitter.com/ulSeFrtYTa", expanded_url: "https://twitter.com/cingeki_anime/status/1295589593513750528/photo/1", type: "photo", sizes: {thumb: {w: 150, h: 150, resize: "crop"}, large: {w: 600, h: 382, resize: "fit"}, small: {w: 600, h: 382, resize: "fit"}, medium: {w: 600, h: 382, resize: "fit"}}}]}, extended_entities: {media: [{id: 1295588525241294800, id_str: "1295588525241294848", indices: [166,189], media_url: "http://pbs.twimg.com/tweet_video_thumb/Efra5j4UYAAJUbk.jpg", media_url_https: "https://pbs.twimg.com/tweet_video_thumb/Efra5j4UYAAJUbk.jpg", url: "https://t.co/ulSeFrtYTa", display_url: "pic.twitter.com/ulSeFrtYTa", expanded_url: "https://twitter.com/cingeki_anime/status/1295589593513750528/photo/1", type: "animated_gif", sizes: {thumb: {w: 150, h: 150, resize: "crop"}, large: {w: 600, h: 382, resize: "fit"}, small: {w: 600, h: 382, resize: "fit"}, medium: {w: 600, h: 382, resize: "fit"}}, video_info: {aspect_ratio: [300,191], variants: [{bitrate: 0, content_type: "video/mp4", url: "https://video.twimg.com/tweet_video/Efra5j4UYAAJUbk.mp4"}]}}]}, source: "<a href=\"https://ads-api.twitter.com\" rel=\"nofollow\">Twitter for Advertisers</a>", in_reply_to_status_id: null, in_reply_to_status_id_str: null, in_reply_to_user_id: null, in_reply_to_user_id_str: null, in_reply_to_screen_name: null, user: {id: 831788878864511000, id_str: "831788878864510978", name: "TV\u30a2\u30cb\u30e1\u300c\u30b7\u30f3\u30c7\u30ec\u30e9\u30ac\u30fc\u30eb\u30ba\u5287\u5834\u300d\u516c\u5f0f", screen_name: "cingeki_anime", location: "", description: "TV\u30a2\u30cb\u30e1\u300c\u30a2\u30a4\u30c9\u30eb\u30de\u30b9\u30bf\u30fc \u30b7\u30f3\u30c7\u30ec\u30e9\u30ac\u30fc\u30eb\u30ba\u5287\u5834\u300d\u306e\u516c\u5f0f\u30a2\u30ab\u30a6\u30f3\u30c8\u3067\u3059\u3002\u4eca\u5f8c\u3082\u4f5c\u54c1\u95a2\u9023\u60c5\u5831\u306a\u3069\u545f\u3044\u3066\u3044\u304d\u307e\u3059\u3002\u30cf\u30c3\u30b7\u30e5\u30bf\u30b0\u306f\u3000#\u3057\u3093\u3052\u304d", url: "https://t.co/IwwdvYQMv5", entities: {url: {urls: [{url: "https://t.co/IwwdvYQMv5", expanded_url: "http://cingeki-anime.com", display_url: "cingeki-anime.com", indices: [0,23]}]}, description: {urls: []}}, protected: false, followers_count: 49825, friends_count: 12, listed_count: 1129, created_at: "Wed Feb 15 08:54:57 +0000 2017", favourites_count: 180, utc_offset: null, time_zone: null, geo_enabled: false, verified: false, statuses_count: 596, lang: null, contributors_enabled: false, is_translator: false, is_translation_enabled: false, profile_background_color: "000000", profile_background_image_url: "http://abs.twimg.com/images/themes/theme1/bg.png", profile_background_image_url_https: "https://abs.twimg.com/images/themes/theme1/bg.png", profile_background_tile: false, profile_image_url: "http://pbs.twimg.com/profile_images/833224103385452545/_ZF4MVoA_normal.jpg", profile_image_url_https: "https://pbs.twimg.com/profile_images/833224103385452545/_ZF4MVoA_normal.jpg", profile_banner_url: "https://pbs.twimg.com/profile_banners/831788878864510978/1516851079", profile_link_color: "F58EA8", profile_sidebar_border_color: "000000", profile_sidebar_fill_color: "000000", profile_text_color: "000000", profile_use_background_image: false, has_extended_profile: false, default_profile: false, default_profile_image: false, following: false, follow_request_sent: false, notifications: false, translator_type: "none"}, geo: null, coordinates: null, place: null, contributors: null, is_quote_status: false, retweet_count: 1093, favorite_count: 1810, favorited: false, retweeted: false, possibly_sensitive: false, lang: "ja"}
];

(new Webshot(0, () => {/**/}))(twitter, async (img, lastResort) => {
    const tempFile = temp.openSync({suffix: '.' + img.url.match(/\/(.+);/).slice(1)[0]});
    writeSync(tempFile.fd, Buffer.from(img.url.split(',')[1], 'base64'));
    closeSync(tempFile.fd);
    return [Message.Image('', img.path, tempFile.path), lastResort()];
}, () => {/**/}, 15000);
