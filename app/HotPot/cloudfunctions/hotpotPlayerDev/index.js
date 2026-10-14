'use strict';
const cloud = require('wx-server-sdk');
const settings = require('./settings.json');
const sdk = require('@cloudbase/node-sdk');
const {requestIdentity} = require('./request-context');
const {createHandler} = require('./handler');
const domain = require('./generated/PlayerData');
const regions = require('./regions.json');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
exports.main = (event, context) => {
    const runtimeEnvironment = process.env.TCB_ENV || process.env.SCF_NAMESPACE;
    const identity = requestIdentity(sdk, context, runtimeEnvironment);
    // 每次调用独立的身份闭包；SDK 仅承担服务端数据库与文件访问。
    return createHandler({getWXContext: () => identity,
        database: options => cloud.database(options), downloadFile: options => cloud.downloadFile(options)},
        settings, domain, regions, runtimeEnvironment)(event);
};
