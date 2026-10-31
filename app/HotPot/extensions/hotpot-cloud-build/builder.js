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
          '保持启用。完整目录、AppID和平台设置在构建开始前校验；发布包名称应为 wechatgame-cloud-dev。',
        default: true,
        render: {ui: 'ui-checkbox', attributes: {disabled: true}},
        verifyRules: ['cloudDevelopmentTarget'],
      },
    },
    verifyRuleMap: {
      cloudDevelopmentTarget: {
        message:
          '构建参数未通过校验，请查看控制台 [HotPot Cloud Build] 的具体原因。',
        /**
         * This is a field validator. Builder UI may pass package-local or partial
         * options, not the final build task. Cross-field checks belong to the
         * existing onBeforeBuild hook, which runs before any generated writes.
         */
        func: (value, options) => {
          if (value !== true) return false;
          if (!options?.packages?.wechatgame || !options.buildPath) return true;
          // Older panels provide a complete task, so retain their early checks.
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
