'use strict';
const cloud = require('wx-server-sdk');
const settings = require('./settings.json');
cloud.init({env: cloud.DYNAMIC_CURRENT_ENV});
exports.main = require('./handler').createHandler(cloud, settings,
    require('./generated/PlayerData'), require('./regions.json'));
