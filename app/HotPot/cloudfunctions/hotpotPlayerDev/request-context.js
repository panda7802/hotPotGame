'use strict';

/**
 * 仅解析平台传入的本次调用上下文，不回退到进程中可能残留的微信身份。
 */
/**
 * 仅从本次云函数调用上下文解析环境与微信身份。
 */
exports.requestIdentity =  function requestIdentity(sdk, context, runtimeEnvironment) {
  try {
    const parsed = sdk.parseContext(context);
    const environment = parsed.environment || parsed.environ || {};
    return {
      ENV: environment.TCB_ENV || environment.SCF_NAMESPACE || runtimeEnvironment,
      OPENID: typeof environment.WX_OPENID === 'string' ? environment.WX_OPENID : undefined,
      APPID: typeof environment.WX_APPID === 'string' ? environment.WX_APPID : undefined,
    };
  } catch {return {ENV: runtimeEnvironment};}
};
