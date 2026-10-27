'use strict';
const cloud = require('wx-server-sdk');
const settings = require('./settings.json');
const sdk = require('@cloudbase/node-sdk');
const {requestIdentity} = require('./request-context');
const {createHandler} = require('./handler');
const domain = require('./PlayerData.js');
const regions = require('./regions.json');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
exports.main = /** 处理 main 对应的游戏逻辑。 */ (event, context) => {
    const runtimeEnvironment = process.env.TCB_ENV || process.env.SCF_NAMESPACE;
    const identity = requestIdentity(sdk, context, runtimeEnvironment);
    // 每次调用独立的身份闭包；SDK 仅承担服务端数据库与文件访问。
    return createHandler({getWXContext: /** 读取或查找 getWXContext 对应的数据，供游戏使用。 */ () => identity,
        database: /** 处理 database 对应的游戏逻辑。 */ options => cloud.database(options), downloadFile: /** 处理 downloadFile 对应的游戏逻辑。 */ options => cloud.downloadFile(options)},
        settings, domain, regions, runtimeEnvironment)(event);
};
