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
        description:
          '发布包名称须为 wechatgame-cloud-dev；若自动追加了 -001，请手动去掉。任务名不能代替输出目录名称。',
        default: true,
        render: {ui: 'ui-checkbox', attributes: {disabled: true}},
        verifyRules: ['cloudDevelopmentTarget'],
      },
    },
    verifyRuleMap: {
      cloudDevelopmentTarget: {
        message:
          '云开发配置校验失败，具体原因见控制台 [HotPot Cloud Build' +
          ']。发布包名称须为 wechatgame-cloud-dev，不能带 -00' +
          '1。',
        /**
         * 验证编辑器当前的云开发构建选项。
         */
        func: (_value, options) => {
          try {
            assertBuildOptions(root, options);
            return true;
          } catch (error) {
            console.error(`[HotPot Cloud Build] ${error.message}`);
            return false;
          }
        },
      },
    },
  },
};
