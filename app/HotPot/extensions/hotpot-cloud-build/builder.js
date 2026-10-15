'use strict';
const path = require('path');
const {assertBuildOptions} = require('../../tools/cloud-build-pipeline.cjs');
const root = path.resolve(__dirname, '../..');

exports.configs = {
    wechatgame: {
        hooks: './hooks.js',
        options: {
            protectRelease: {
                label: '保护旧发布目录',
                description: '请导入云开发配置，输出 build/wechatgame-cloud-dev。',
                default: true,
                render: {ui: 'ui-checkbox', attributes: {disabled: true}},
                verifyRules: ['cloudDevelopmentTarget'],
            },
        },
        verifyRuleMap: {
            cloudDevelopmentTarget: {
                message: '请新建任务并导入 tools/wechat-cloud-dev.build.json；旧发布目录禁止覆盖。',
                func: (_value, options) => {
                    try { assertBuildOptions(root, options); return true; }
                    catch { return false; }
                },
            },
        },
    },
};
